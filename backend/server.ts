/**
 * LLM WIKI — API Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Express REST API，整合元數據解析、型別校驗、CI 寫回三個後端引擎。
 *
 * 端點：
 *   GET  /api/modules              — 列出所有模組
 *   GET  /api/modules/search?q=    — 模組搜尋（須置於 /:id 之前）
 *   GET  /api/modules/:id          — 單一模組詳情
 *   POST /api/validate             — 校驗兩模組型別相容性
 *   POST /api/validate/pipeline    — 校驗整條 Pipeline
 *   POST /api/ci/writeback         — CI 結果寫回（需 x-ci-secret header）
 *   GET  /api/health               — 健康檢查
 *
 * 啟動：npm run dev
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getModuleIndex, getModuleById, searchModules, startParser } from './parser/metadata-parser.js';
import { validateConnection, validatePipeline, TypeMismatchException } from './type-checker/type-checker.js';
import { writebackResult, CIResult } from './ci-watcher/ci-watcher.js';

const app  = express();
import crypto from 'crypto';

const PORT      = Number(process.env['PORT'] ?? 3001);
const BIND_HOST = process.env['BIND_HOST'] ?? '127.0.0.1';   // 預設只允許本機

// ── HUD Token（防止區網未授權存取）─────────────────────────────────────────
// 優先讀 .env 的 HUD_TOKEN；若未設定，啟動時自動產生並印到 terminal。
// 前端從 localStorage 讀取 token，每次 mutation 請求帶 x-hud-token header。
const HUD_TOKEN: string = (() => {
  const envToken = process.env['HUD_TOKEN'];
  if (envToken?.trim()) return envToken.trim();
  const generated = crypto.randomBytes(24).toString('hex');
  console.warn('\n[Security] HUD_TOKEN 未設定，本次啟動使用暫時 token：');
  console.warn(`[Security]   HUD_TOKEN=${generated}`);
  console.warn('[Security] 建議將上方 token 加入 .env 以持久化。\n');
  return generated;
})();

/** 驗證 x-hud-token header（用於所有寫入 / 刪除路由）*/
function requireToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-hud-token'];
  if (!token || token !== HUD_TOKEN) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid x-hud-token' });
    return;
  }
  next();
}

// ── Security headers (inline, no helmet dep) ──────────────────────────────────

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ── Core middleware ───────────────────────────────────────────────────────────

// CORS：預設只允許本機來源；可透過 CORS_ORIGIN 環境變數覆寫（多個以逗號分隔）
const allowedOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost,http://127.0.0.1')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // origin 為 undefined 表示同源請求（curl / Electron 本機開啟）
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some(allowed =>
      origin === allowed || origin.startsWith(allowed + ':')
    );
    cb(ok ? null : new Error(`CORS: origin "${origin}" not allowed`), ok);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-ci-secret'],
}));
app.use(express.json());

// ── Request logger ────────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[API] ${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status:  'ok',
    modules: getModuleIndex().size,
    time:    new Date().toISOString(),
  });
});

// ── Routes: Modules ───────────────────────────────────────────────────────────

// GET /api/modules
app.get('/api/modules', (_req: Request, res: Response) => {
  const modules = [...getModuleIndex().values()];
  res.json({ count: modules.length, modules });
});

// GET /api/modules/search?q=<query>   ← MUST be before /:id
app.get('/api/modules/search', (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'Query param "q" is required' });
    return;
  }
  const results = searchModules(q);
  res.json({ count: results.length, results });
});

// GET /api/modules/:id
app.get('/api/modules/:id', (req: Request, res: Response) => {
  const id = Number(req.params['id']);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid module id — must be a number' });
    return;
  }
  const mod = getModuleById(id);
  if (!mod) {
    res.status(404).json({ error: `Module #${id} not found` });
    return;
  }
  res.json(mod);
});

// ── Routes: Type Validation ───────────────────────────────────────────────────

/**
 * POST /api/validate
 * Body: { moduleIdA: number, moduleIdB: number }
 */
app.post('/api/validate', (req: Request, res: Response) => {
  const { moduleIdA, moduleIdB } = (req.body ?? {}) as { moduleIdA?: number; moduleIdB?: number };

  if (!moduleIdA || !moduleIdB) {
    res.status(400).json({ error: 'moduleIdA and moduleIdB are required' });
    return;
  }

  const modA = getModuleById(Number(moduleIdA));
  const modB = getModuleById(Number(moduleIdB));

  if (!modA) { res.status(404).json({ error: `Module #${moduleIdA} not found` }); return; }
  if (!modB) { res.status(404).json({ error: `Module #${moduleIdB} not found` }); return; }

  try {
    const result = validateConnection(modA, modB, false);
    res.json(result);
  } catch (e) {
    if (e instanceof TypeMismatchException) {
      res.status(422).json({
        error:      'TypeMismatchException',
        message:    e.message,
        outputType: e.outputType,
        inputType:  e.inputType,
      });
      return;
    }
    throw e;
  }
});

/**
 * POST /api/validate/pipeline
 * Body: { moduleIds: number[] }
 */
app.post('/api/validate/pipeline', (req: Request, res: Response) => {
  const ids: number[] = (req.body as any)?.moduleIds ?? [];

  if (!Array.isArray(ids) || ids.length < 2) {
    res.status(400).json({ error: 'moduleIds must be an array with at least 2 elements' });
    return;
  }

  const modules = ids.map(id => getModuleById(id)).filter(Boolean) as any[];
  if (modules.length !== ids.length) {
    res.status(404).json({ error: 'One or more module IDs not found' });
    return;
  }

  res.json(validatePipeline(modules));
});

// ── Routes: CI Writeback ──────────────────────────────────────────────────────

/**
 * POST /api/ci/writeback
 * Header: x-ci-secret: <CI_SECRET env>
 * Body:   CIResult
 */
app.post('/api/ci/writeback', async (req: Request, res: Response) => {
  const secret = process.env['CI_SECRET'];
  if (secret && req.headers['x-ci-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized — invalid x-ci-secret' });
    return;
  }

  const body = req.body as Partial<CIResult>;
  if (!body.moduleId || !body.status) {
    res.status(400).json({ error: 'moduleId and status are required' });
    return;
  }

  try {
    await writebackResult({
      moduleId:    body.moduleId,
      moduleName:  body.moduleName ?? `module-${body.moduleId}`,
      status:      body.status,
      latency:     body.latency    ?? '~?ms',
      testsPassed: body.testsPassed ?? 0,
      testsFailed: body.testsFailed ?? 0,
      capturedAt:  new Date().toISOString(),
      notes:       body.notes,
    });
    res.json({ success: true, message: `Module #${body.moduleId} updated` });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await startParser();
  app.listen(PORT, BIND_HOST, () => {
    console.log(`\n[LLM WIKI] API server ready → http://localhost:${PORT}`);
    console.log(`[LLM WIKI] Health: GET http://localhost:${PORT}/api/health`);
    console.log(`[LLM WIKI] Modules: GET http://localhost:${PORT}/api/modules\n`);
  });
}

bootstrap().catch(console.error);

export default app;

// ══════════════════════════════════════════════════════════════════════════════
// LIVE DATA ROUTES — 真實資料連結
// ══════════════════════════════════════════════════════════════════════════════

import fs   from 'fs/promises';
import fss  from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import matter from 'gray-matter';

const NOTES_DIR      = path.resolve(process.env['NOTES_DIR']      ?? '.system/user/notes');
const MILESTONES_DIR = path.resolve(process.env['MILESTONES_DIR'] ?? 'milestones');
const DOCS_DIR       = path.resolve(process.env['DOCS_DIR']       ?? 'docs');

// ── Ensure notes directory exists ─────────────────────────────────────────────
fs.mkdir(NOTES_DIR, { recursive: true }).catch(() => {});

// ── F1: Notes CRUD ────────────────────────────────────────────────────────────

// GET /api/notes — list all note files
app.get('/api/notes', async (_req: Request, res: Response) => {
  try {
    await fs.mkdir(NOTES_DIR, { recursive: true });
    const files = await fs.readdir(NOTES_DIR);
    const notes = await Promise.all(
      files.filter(f => f.endsWith('.md')).map(async f => {
        const stat = await fs.stat(path.join(NOTES_DIR, f));
        const raw  = await fs.readFile(path.join(NOTES_DIR, f), 'utf-8');
        return {
          filename: f,
          size:     stat.size,
          modified: stat.mtime.toISOString(),
          preview:  raw.slice(0, 80).replace(/\n/g, ' '),
        };
      })
    );
    notes.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ count: notes.length, notes });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// GET /api/notes/:filename — read note content
app.get('/api/notes/:filename', async (req: Request, res: Response) => {
  const filename = path.basename(req.params['filename'] ?? '');
  if (!filename.endsWith('.md')) { res.status(400).json({ error: 'Only .md files allowed' }); return; }
  try {
    const content = await fs.readFile(path.join(NOTES_DIR, filename), 'utf-8');
    res.json({ filename, content });
  } catch {
    res.status(404).json({ error: `Note "${filename}" not found` });
  }
});

// POST /api/notes/:filename — create or update note [AUTH]
app.post('/api/notes/:filename', requireToken, async (req: Request, res: Response) => {
  const filename = path.basename(req.params['filename'] ?? '');
  if (!filename.endsWith('.md')) { res.status(400).json({ error: 'Only .md files allowed' }); return; }
  const { content } = (req.body ?? {}) as { content?: string };
  if (typeof content !== 'string') { res.status(400).json({ error: '"content" string is required' }); return; }
  try {
    await fs.mkdir(NOTES_DIR, { recursive: true });
    await fs.writeFile(path.join(NOTES_DIR, filename), content, 'utf-8');
    res.json({ success: true, filename, bytes: Buffer.byteLength(content) });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// DELETE /api/notes/:filename [AUTH]
app.delete('/api/notes/:filename', requireToken, async (req: Request, res: Response) => {
  const filename = path.basename(req.params['filename'] ?? '');
  if (!filename.endsWith('.md')) { res.status(400).json({ error: 'Only .md files allowed' }); return; }
  try {
    await fs.unlink(path.join(NOTES_DIR, filename));
    res.json({ success: true, filename });
  } catch {
    res.status(404).json({ error: `Note "${filename}" not found` });
  }
});

// ── F2: Git commits ───────────────────────────────────────────────────────────

// GET /api/git/commits?limit=20
app.get('/api/git/commits', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
  try {
    const git     = simpleGit(path.resolve('.'));
    const log     = await git.log({ maxCount: limit });
    const commits = log.all.map(c => ({
      hash:    c.hash.slice(0, 7),
      message: c.message,
      author:  c.author_name,
      email:   c.author_email,
      date:    c.date,
    }));
    res.json({ count: commits.length, commits });
  } catch (err: any) {
    // Not a git repo or git not installed → return empty gracefully
    res.json({ count: 0, commits: [], warning: String(err.message) });
  }
});

// GET /api/git/status — current working tree status
app.get('/api/git/status', async (_req: Request, res: Response) => {
  try {
    const git    = simpleGit(path.resolve('.'));
    const status = await git.status();
    res.json({
      branch:   status.current,
      ahead:    status.ahead,
      behind:   status.behind,
      modified: status.modified,
      staged:   status.staged,
      untracked:status.not_added,
    });
  } catch (err: any) {
    res.json({ warning: String(err.message) });
  }
});

// ── F4: Milestones ────────────────────────────────────────────────────────────

// GET /api/milestones
app.get('/api/milestones', async (_req: Request, res: Response) => {
  try {
    if (!fss.existsSync(MILESTONES_DIR)) {
      res.json({ count: 0, milestones: [] }); return;
    }
    const files = (await fs.readdir(MILESTONES_DIR)).filter(f => f.endsWith('.md'));
    const milestones = await Promise.all(files.map(async f => {
      const raw       = await fs.readFile(path.join(MILESTONES_DIR, f), 'utf-8');
      const { data }  = matter(raw);
      return {
        filename:   f,
        title:      String(data['title']      ?? f.replace('.md', '')),
        status:     String(data['status']     ?? 'WIP'),
        completion: Number(data['completion'] ?? 0),
        totalTasks: Number(data['total_tasks']?? 0),
        doneTasks:  Number(data['done_tasks'] ?? 0),
        due:        String(data['due']        ?? ''),
        tags:       Array.isArray(data['tags']) ? data['tags'] as string[] : [],
      };
    }));
    milestones.sort((a, b) => b.completion - a.completion);
    res.json({ count: milestones.length, milestones });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// ── M: Docs directory tree ────────────────────────────────────────────────────

interface TreeNode { name: string; path: string; type: 'dir' | 'file'; children?: TreeNode[] }

async function buildTree(dir: string, base: string): Promise<TreeNode[]> {
  if (!fss.existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = path.join(base, e.name);
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: rel, type: 'dir', children: await buildTree(path.join(dir, e.name), rel) });
    } else if (e.name.endsWith('.md')) {
      nodes.push({ name: e.name, path: rel, type: 'file' });
    }
  }
  return nodes;
}

// GET /api/docs/tree
app.get('/api/docs/tree', async (_req: Request, res: Response) => {
  try {
    const tree = await buildTree(DOCS_DIR, '');
    res.json({ tree });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// GET /api/docs/search?q=<query>
app.get('/api/docs/search', async (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').trim().toLowerCase();
  if (!q) { res.status(400).json({ error: '"q" param required' }); return; }

  const results: { path: string; title: string; excerpt: string; tags: string[] }[] = [];

  async function walk(dir: string, rel: string) {
    if (!fss.existsSync(dir)) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const r    = path.join(rel, e.name);
      if (e.isDirectory()) { await walk(full, r); continue; }
      if (!e.name.endsWith('.md')) continue;
      const raw      = await fs.readFile(full, 'utf-8');
      const { data, content } = matter(raw);
      const haystack = [data['title'], content, ...(data['tags'] ?? [])].join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
      const idx = haystack.indexOf(q);
      results.push({
        path:    r,
        title:   String(data['title'] ?? e.name.replace('.md', '')),
        excerpt: content.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, ' ').trim(),
        tags:    Array.isArray(data['tags']) ? data['tags'] as string[] : [],
      });
    }
  }

  try {
    await walk(DOCS_DIR, '');
    res.json({ count: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// GET /api/docs/file?path=<rel-path> — read a single doc
app.get('/api/docs/file', async (req: Request, res: Response) => {
  const rel = String(req.query['path'] ?? '');
  if (!rel || rel.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return; }
  const full = path.join(DOCS_DIR, rel);
  if (!full.startsWith(DOCS_DIR)) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const raw      = await fs.readFile(full, 'utf-8');
    const { data, content } = matter(raw);
    res.json({ path: rel, frontmatter: data, content });
  } catch {
    res.status(404).json({ error: `Doc "${rel}" not found` });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST ROUTES — 單元/整合/端對端測試 API
// ══════════════════════════════════════════════════════════════════════════════

import { spawn } from 'child_process';

interface TestCase {
  name:     string;
  status:   'pass' | 'fail' | 'skip' | 'pending';
  duration: number;    // ms
  error?:   string;
  file?:    string;
}

interface TestSuite {
  id:        string;
  name:      string;
  type:      'unit' | 'integration' | 'e2e';
  file:      string;
  status:    'pass' | 'fail' | 'pending' | 'running';
  total:     number;
  passed:    number;
  failed:    number;
  skipped:   number;
  duration:  number;
  lastRun?:  string;
  cases:     TestCase[];
  danger:    boolean;   // high-risk = integration or e2e with failures
}

// ── Mock data generator (真實環境替換為執行 vitest/jest --json) ───────────────

function mockSuites(): TestSuite[] {
  return [
    {
      id: 'unit-parser', name: 'Metadata Parser', type: 'unit', file: 'backend/parser/metadata-parser.test.ts',
      status: 'pass', total: 12, passed: 12, failed: 0, skipped: 0, duration: 48, danger: false,
      lastRun: new Date(Date.now()-3600000).toISOString(),
      cases: [
        { name: 'should parse YAML front matter', status:'pass', duration:8 },
        { name: 'should extract //INPUT block', status:'pass', duration:5 },
        { name: 'should extract //OUTPUT block', status:'pass', duration:4 },
        { name: 'should handle missing input block', status:'pass', duration:3 },
        { name: 'should handle missing output block', status:'pass', duration:3 },
        { name: 'should return null for invalid YAML', status:'pass', duration:4 },
        { name: 'should persist index to JSON', status:'pass', duration:6 },
        { name: 'should load persisted index', status:'pass', duration:5 },
        { name: 'should detect status DONE', status:'pass', duration:2 },
        { name: 'should detect status BLOCKED', status:'pass', duration:2 },
        { name: 'should detect status WIP', status:'pass', duration:2 },
        { name: 'should search modules by name', status:'pass', duration:4 },
      ]
    },
    {
      id: 'unit-typechecker', name: 'Type Checker', type: 'unit', file: 'backend/type-checker/type-checker.test.ts',
      status: 'pass', total: 9, passed: 9, failed: 0, skipped: 0, duration: 22, danger: false,
      lastRun: new Date(Date.now()-3600000).toISOString(),
      cases: [
        { name: 'STR → STR should be compatible', status:'pass', duration:1 },
        { name: 'STR → INT should throw TypeMismatch', status:'pass', duration:2 },
        { name: 'ANY → anything should be compatible', status:'pass', duration:1 },
        { name: 'INT → NUM should be compatible', status:'pass', duration:1 },
        { name: 'FLOAT → NUM should be compatible', status:'pass', duration:1 },
        { name: 'ARR → OBJ should throw TypeMismatch', status:'pass', duration:1 },
        { name: 'validatePipeline with valid chain', status:'pass', duration:5 },
        { name: 'validatePipeline detects first error', status:'pass', duration:4 },
        { name: 'suggestAdapter STR→ARR returns split', status:'pass', duration:2 },
      ]
    },
    {
      id: 'unit-vector', name: 'Vector Index', type: 'unit', file: 'backend/vector/vector-index.test.ts',
      status: 'fail', total: 6, passed: 4, failed: 2, skipped: 0, duration: 310, danger: false,
      lastRun: new Date(Date.now()-7200000).toISOString(),
      cases: [
        { name: 'fuzzySearch returns results', status:'pass', duration:3 },
        { name: 'fuzzySearch empty query returns all', status:'pass', duration:2 },
        { name: 'cosineSimilarity of identical vectors = 1', status:'pass', duration:1 },
        { name: 'cosineSimilarity of zero vectors = 0', status:'pass', duration:1 },
        { name: 'embedBatch with no API key returns zeros', status:'fail', duration:150, error:'AssertionError: Expected 1536 zeros but got TypeError: fetch is not defined' },
        { name: 'build() loads from cache', status:'fail', duration:153, error:'ENOENT: .system/vector-cache.json no such file' },
      ]
    },
    {
      id: 'unit-ciwatcher', name: 'CI Watcher', type: 'unit', file: 'backend/ci-watcher/ci-watcher.test.ts',
      status: 'pass', total: 5, passed: 5, failed: 0, skipped: 0, duration: 35, danger: false,
      lastRun: new Date(Date.now()-3600000).toISOString(),
      cases: [
        { name: 'writebackResult updates YAML status', status:'pass', duration:8 },
        { name: 'writebackResult updates latency', status:'pass', duration:7 },
        { name: 'writebackResult appends CI log section', status:'pass', duration:6 },
        { name: 'writebackResult creates system log', status:'pass', duration:8 },
        { name: 'CLI parses --module --status args', status:'pass', duration:6 },
      ]
    },
    {
      id: 'integration-api', name: 'API Endpoints', type: 'integration', file: 'backend/server.integration.test.ts',
      status: 'fail', total: 14, passed: 11, failed: 3, skipped: 0, duration: 820, danger: true,
      lastRun: new Date(Date.now()-1800000).toISOString(),
      cases: [
        { name: 'GET /api/health returns ok', status:'pass', duration:45 },
        { name: 'GET /api/modules returns array', status:'pass', duration:62 },
        { name: 'GET /api/modules/search?q= returns results', status:'pass', duration:58 },
        { name: 'GET /api/modules/:id returns module', status:'pass', duration:40 },
        { name: 'GET /api/modules/:id 404 on missing', status:'pass', duration:35 },
        { name: 'POST /api/validate compatible pair', status:'pass', duration:52 },
        { name: 'POST /api/validate incompatible returns 422', status:'pass', duration:48 },
        { name: 'POST /api/validate/pipeline', status:'pass', duration:65 },
        { name: 'GET /api/notes lists files', status:'pass', duration:55 },
        { name: 'POST /api/notes saves content', status:'pass', duration:70 },
        { name: 'GET /api/git/commits returns log', status:'pass', duration:90 },
        { name: 'GET /api/milestones parses YAML', status:'fail', duration:95, error:'Expected field "completion" to be number, got undefined — milestones/phase-1.md missing field' },
        { name: 'GET /api/docs/tree returns nodes', status:'fail', duration:35, error:'ENOENT: docs/ directory does not exist' },
        { name: 'GET /api/docs/search?q= searches content', status:'fail', duration:70, error:'Cannot search: docs/ directory does not exist' },
      ]
    },
    {
      id: 'integration-notes', name: 'Notes CRUD Flow', type: 'integration', file: 'backend/notes.integration.test.ts',
      status: 'pass', total: 7, passed: 7, failed: 0, skipped: 0, duration: 340, danger: false,
      lastRun: new Date(Date.now()-3600000).toISOString(),
      cases: [
        { name: 'create note with POST', status:'pass', duration:45 },
        { name: 'list notes includes new file', status:'pass', duration:38 },
        { name: 'read note content matches saved', status:'pass', duration:42 },
        { name: 'overwrite note with PUT', status:'pass', duration:48 },
        { name: 'delete note removes file', status:'pass', duration:50 },
        { name: 'list after delete excludes file', status:'pass', duration:62 },
        { name: 'reject non-.md filename', status:'pass', duration:55 },
      ]
    },
    {
      id: 'e2e-hud', name: 'HUD F1-F5 流程', type: 'e2e', file: 'e2e/hud.e2e.test.ts',
      status: 'pending', total: 8, passed: 0, failed: 0, skipped: 8, duration: 0, danger: true,
      lastRun: undefined,
      cases: [
        { name: 'F1 日誌面板開啟並能輸入', status:'pending', duration:0 },
        { name: 'F1 Ctrl+S 儲存筆記', status:'pending', duration:0 },
        { name: 'F2 顯示 Git commit 列表', status:'pending', duration:0 },
        { name: 'F3 測試面板網格載入', status:'pending', duration:0 },
        { name: 'F4 里程碑進度正確顯示', status:'pending', duration:0 },
        { name: 'F5 圖鑑搜尋回傳結果', status:'pending', duration:0 },
        { name: 'B 背包型別串接校驗', status:'pending', duration:0 },
        { name: 'M 地圖目錄樹展開', status:'pending', duration:0 },
      ]
    },
    {
      id: 'e2e-theme', name: '換殼 Theme 流程', type: 'e2e', file: 'e2e/theme.e2e.test.ts',
      status: 'pending', total: 5, passed: 0, failed: 0, skipped: 5, duration: 0, danger: false,
      lastRun: undefined,
      cases: [
        { name: '上傳背景圖片並顯示', status:'pending', duration:0 },
        { name: '上傳 minimap 覆蓋 SVG fallback', status:'pending', duration:0 },
        { name: '上傳 theme.json 套用 CSS variables', status:'pending', duration:0 },
        { name: '上傳鍵位圖示替換 SVG', status:'pending', duration:0 },
        { name: '清除所有資源還原預設', status:'pending', duration:0 },
      ]
    },
  ];
}

// GET /api/tests — list all suites (summary only, no cases)
app.get('/api/tests', (_req: Request, res: Response) => {
  const suites = mockSuites().map(({ cases: _c, ...s }) => s);
  res.json({ count: suites.length, suites });
});

// GET /api/tests/:id — full suite with cases
app.get('/api/tests/:id', (req: Request, res: Response) => {
  const suite = mockSuites().find(s => s.id === req.params['id']);
  if (!suite) { res.status(404).json({ error: 'Test suite not found' }); return; }
  res.json(suite);
});

// POST /api/tests/run — trigger test run (real: spawn vitest)
app.post('/api/tests/run', (req: Request, res: Response) => {
  const { id } = (req.body ?? {}) as { id?: string };
  // In production: spawn('npx', ['vitest', 'run', '--reporter=json', suitefile])
  res.json({ status: 'queued', message: `Test suite "${id || 'all'}" queued for execution` });
});

// ══════════════════════════════════════════════════════════════════════════════
// M: WIKI ROUTES — AI 整理產出知識庫（wiki/ 目錄，獨立於 docs/）
// ══════════════════════════════════════════════════════════════════════════════

const WIKI_DIR = path.resolve(process.env['WIKI_DIR'] ?? 'wiki');
fs.mkdir(WIKI_DIR, { recursive: true }).catch(() => {});

// ── Hermes Agent 整合 ───────────────────────────────────────────────────────
// Hermes Agent（Nous Research）是獨立的 agent 執行框架，提供 OpenAI 相容的
// /v1/chat/completions，支援標準 tool_calls 格式。
// 這裡定義 wiki 整理任務可用的工具集，由 Hermes 自主規劃呼叫順序。

const HERMES_BASE_URL = (process.env['HERMES_BASE_URL'] ?? 'http://127.0.0.1:8642').replace(/\/$/, '');
const HERMES_MAX_TURNS = 8; // agent 迴圈上限，避免無限呼叫

// Hermes 可用工具定義（OpenAI tools schema）
const HERMES_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_docs',
      description: '在 docs/（唯讀來源）全文搜尋關鍵字，回傳相關文件路徑與標題',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '搜尋關鍵字' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_doc',
      description: '讀取 docs/ 底下單一文件的完整內容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '相對於 docs/ 的路徑，例如 "TypeScript/basics.md"' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_wiki',
      description: '列出 wiki/ 目錄下現有文件，避免重複建立',
      parameters: {
        type: 'object',
        properties: { domain: { type: 'string', description: '（可選）只列出某個 Domain 子目錄' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_wiki',
      description: '寫入一個 wiki/ 文件到暫存區（不會立即落地，需使用者最後確認）',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: '相對於 wiki/ 的路徑，格式 Domain/Topic/filename.md' },
          content: { type: 'string', description: '完整 Markdown 內容（含 frontmatter）' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '結束本輪任務，回報已完成的整理摘要',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: '簡短說明這次整理了什麼' } },
        required: ['summary'],
      },
    },
  },
] as const;

interface HermesAgentResult {
  type:    'files' | 'question' | 'error';
  files?:  { path: string; content: string }[];
  message?: string;
  summary?: string;
}

/** 執行 Hermes Agent 的工具呼叫，回傳工具結果文字 */
async function executeHermesTool(name: string, args: any, stagedFiles: { path: string; content: string }[]): Promise<string> {
  switch (name) {
    case 'search_docs': {
      const q = String(args?.query ?? '').toLowerCase();
      const results: string[] = [];
      async function walk(dir: string, rel: string) {
        if (!fss.existsSync(dir)) return;
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const full = path.join(dir, e.name), r = path.join(rel, e.name);
          if (e.isDirectory()) { await walk(full, r); continue; }
          if (!e.name.endsWith('.md')) continue;
          const raw = await fs.readFile(full, 'utf-8');
          const { data, content: body } = matter(raw);
          const hay = `${data['title'] ?? ''} ${body}`.toLowerCase();
          if (hay.includes(q)) results.push(`- docs/${r}：${data['title'] ?? e.name}`);
        }
      }
      await walk(DOCS_DIR, '').catch(() => {});
      return results.length ? results.slice(0, 20).join('\n') : '（無符合結果）';
    }
    case 'read_doc': {
      const rel = String(args?.path ?? '');
      if (!rel || rel.includes('..')) return '錯誤：無效路徑';
      const full = path.join(DOCS_DIR, rel);
      if (!full.startsWith(DOCS_DIR)) return '錯誤：路徑超出 docs/ 範圍';
      try {
        const raw = await fs.readFile(full, 'utf-8');
        return raw.slice(0, 4000);
      } catch { return `錯誤：找不到 docs/${rel}`; }
    }
    case 'list_wiki': {
      const domain = args?.domain ? String(args.domain) : '';
      const results: string[] = [];
      async function walk(dir: string, rel: string) {
        if (!fss.existsSync(dir)) return;
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const full = path.join(dir, e.name), r = path.join(rel, e.name);
          if (e.isDirectory()) { await walk(full, r); continue; }
          if (e.name.endsWith('.md')) results.push(`wiki/${r}`);
        }
      }
      const base = domain ? path.join(WIKI_DIR, domain) : WIKI_DIR;
      await walk(base, domain).catch(() => {});
      return results.length ? results.join('\n') : '（wiki/ 目前無文件）';
    }
    case 'write_wiki': {
      const p = String(args?.path ?? '');
      const c = String(args?.content ?? '');
      if (!p || p.includes('..')) return '錯誤：無效路徑';
      if (!c.trim()) return '錯誤：content 不可為空';
      stagedFiles.push({ path: p, content: c });
      return `已暫存：wiki/${p}（尚未寫入磁碟，等待使用者確認）`;
    }
    case 'finish': {
      return String(args?.summary ?? '完成');
    }
    default:
      return `錯誤：未知工具 "${name}"`;
  }
}

/** Hermes Agent 多輪 tool-calling 迴圈 */
async function runHermesAgent(
  systemPrompt: string,
  history: { role: string; content: string }[],
  userContent: string,
  baseUrlOverride?: string,
): Promise<HermesAgentResult> {
  const hermesKey = process.env['HERMES_API_KEY'] ?? '';
  if (!hermesKey) {
    return { type: 'error', message: '請在 .env 設定 HERMES_API_KEY（查看 ~/.hermes/.env 的 API_SERVER_KEY）' };
  }
  const baseUrl = (baseUrlOverride || HERMES_BASE_URL).replace(/\/$/, '');

  const messages: any[] = [
    { role: 'system', content: systemPrompt + '\n\n你可以使用提供的工具（search_docs / read_doc / list_wiki / write_wiki / finish）來完成任務。請先搜尋並閱讀相關來源，整理後用 write_wiki 寫入，最後務必呼叫 finish 結束。' },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userContent },
  ];

  const stagedFiles: { path: string; content: string }[] = [];
  let finalSummary = '';
  let askedQuestion = '';

  for (let turn = 0; turn < HERMES_MAX_TURNS; turn++) {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${hermesKey}`,
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages,
        tools: HERMES_TOOLS,
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const e = await res.text();
      return { type: 'error', message: `Hermes API 錯誤（${baseUrl}）：${e}` };
    }

    const data = await res.json() as any;
    const choice = data?.choices?.[0];
    const msg    = choice?.message;
    if (!msg) return { type: 'error', message: 'Hermes 回應格式異常（無 message）' };

    messages.push(msg);

    const toolCalls = msg.tool_calls as any[] | undefined;

    if (!toolCalls || !toolCalls.length) {
      // 沒有工具呼叫 → Hermes 直接回文字，視為提問或結論
      const text = msg.content ?? '';
      if (stagedFiles.length) {
        return { type: 'files', files: stagedFiles, summary: finalSummary || text || '已完成整理' };
      }
      askedQuestion = text;
      break;
    }

    // 執行所有工具呼叫，結果塞回對話
    for (const call of toolCalls) {
      const fnName = call.function?.name ?? '';
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments ?? '{}'); } catch {}

      if (fnName === 'finish') {
        finalSummary = String(args?.summary ?? '完成');
      }

      const result = await executeHermesTool(fnName, args, stagedFiles);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      });
    }

    // finish 被呼叫 → 結束迴圈
    if (toolCalls.some(c => c.function?.name === 'finish')) {
      if (stagedFiles.length) {
        return { type: 'files', files: stagedFiles, summary: finalSummary };
      }
      // 沒有產出任何文件就 finish → 視為訊息回覆
      askedQuestion = finalSummary || '（Hermes 未產出任何文件）';
      break;
    }
  }

  if (stagedFiles.length) {
    return { type: 'files', files: stagedFiles, summary: finalSummary || '已完成整理（達到迴圈上限）' };
  }

  return { type: 'question', message: askedQuestion || '（Hermes 未在限制輪數內完成任務，請簡化指令再試）' };
}

// GET /api/wiki/tree
app.get('/api/wiki/tree', async (_req: Request, res: Response) => {
  try {
    await fs.mkdir(WIKI_DIR, { recursive: true });
    const tree = await buildTree(WIKI_DIR, '');
    res.json({ tree });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// GET /api/wiki/file?path=<rel-path>
app.get('/api/wiki/file', async (req: Request, res: Response) => {
  const rel = String(req.query['path'] ?? '');
  if (!rel || rel.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return; }
  const full = path.join(WIKI_DIR, rel);
  if (!full.startsWith(WIKI_DIR)) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const raw = await fs.readFile(full, 'utf-8');
    const { data, content } = matter(raw);
    res.json({ path: rel, frontmatter: data, content });
  } catch {
    res.status(404).json({ error: `Wiki file "${rel}" not found` });
  }
});

// POST /api/wiki/save [AUTH]
app.post('/api/wiki/save', requireToken, async (req: Request, res: Response) => {
  const { path: relPath, content } = (req.body ?? {}) as { path?: string; content?: string };
  if (!relPath || relPath.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return; }
  if (typeof content !== 'string') { res.status(400).json({ error: '"content" is required' }); return; }
  const full = path.join(WIKI_DIR, relPath);
  if (!full.startsWith(WIKI_DIR)) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
    res.json({ success: true, path: relPath, bytes: Buffer.byteLength(content) });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});

// DELETE /api/wiki/file?path=<rel-path> [AUTH]
app.delete('/api/wiki/file', requireToken, async (req: Request, res: Response) => {
  const rel = String(req.query['path'] ?? '');
  if (!rel || rel.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return; }
  const full = path.join(WIKI_DIR, rel);
  if (!full.startsWith(WIKI_DIR)) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    await fs.unlink(full);
    const dir = path.dirname(full);
    const remaining = await fs.readdir(dir);
    if (!remaining.length && dir !== WIKI_DIR) await fs.rmdir(dir);
    res.json({ success: true, path: rel });
  } catch {
    res.status(404).json({ error: `Wiki file "${rel}" not found` });
  }
});

// POST /api/wiki/generate
// Body: { instruction, history, sourcePaths?, aiConfig }
// aiConfig: { provider, openai_key?, anthropic_key?, llama_host?, llama_port?,
//             custom_base_url?, custom_api_key?, custom_model? }
app.post('/api/wiki/generate', async (req: Request, res: Response) => {
  const {
    instruction,
    history    = [],
    sourcePaths = [],
    aiConfig   = {},
  } = (req.body ?? {}) as {
    instruction: string;
    history:     { role: string; content: string }[];
    sourcePaths: string[];
    aiConfig:    { ai_provider?: string; llama_host?: string; llama_port?: string;
                   custom_base_url?: string; custom_model?: string; hermes_base_url?: string;
                   custom_api_key?: string };
    // 注意：API Key 不從 request body 接受，一律從 process.env 讀取
  };
  if (!instruction?.trim()) { res.status(400).json({ error: '"instruction" is required' }); return; }

  // ── 收集 docs/ 內容 ──────────────────────────────────────────────────────
  let sourceContext = '';
  if (sourcePaths.length) {
    const contents = await Promise.all(sourcePaths.slice(0, 8).map(async (p) => {
      try {
        const full = path.join(DOCS_DIR, p);
        if (!full.startsWith(DOCS_DIR)) return null;
        const raw = await fs.readFile(full, 'utf-8');
        return `=== 來源：docs/${p} ===\n${raw.slice(0, 2000)}`;
      } catch { return null; }
    }));
    sourceContext = contents.filter(Boolean).join('\n\n');
  } else {
    const results: string[] = [];
    async function collectTitles(dir: string, rel: string) {
      if (!fss.existsSync(dir)) return;
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full2 = path.join(dir, e.name), r = path.join(rel, e.name);
        if (e.isDirectory()) { await collectTitles(full2, r); continue; }
        if (!e.name.endsWith('.md')) continue;
        const raw2 = await fs.readFile(full2, 'utf-8');
        const { data } = matter(raw2);
        results.push(`- docs/${r}：${data['title'] ?? e.name.replace('.md','')}`);
      }
    }
    await collectTitles(DOCS_DIR, '').catch(() => {});
    sourceContext = results.length
      ? `以下是 docs/ 的所有文件清單：\n${results.join('\n')}`
      : '（docs/ 目錄目前尚無文件）';
  }

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = `你是 LLM WIKI 的知識整理助手。
你的職責：根據使用者指令，參考 docs/（唯讀來源）的內容，整理並生成 wiki/ 目錄下的 Markdown 文件。

## 重要規則
1. docs/ 是唯讀來源，你只能讀取，不能修改。
2. wiki/ 是你的輸出目錄，採用 Domain/Topic/doc.md 三層結構。
3. 如果使用者指令不夠明確（缺少目標領域、文件名稱、或整理方式），你必須主動用繁體中文詢問。
4. 產出文件時，回覆格式必須是 JSON。

## 回覆格式
需要澄清時：直接用繁體中文提問。
可以產出時：只輸出以下 JSON（不要其他文字）：
{
  "files": [
    { "path": "Domain/Topic/filename.md", "content": "---\\ntitle: ...\\n---\\n\\n# ..." }
  ],
  "summary": "說明這次整理了什麼"
}`;

  const userContent = `${instruction}\n\n${sourceContext ? `\n## 參考來源\n${sourceContext}` : ''}`;

  // ── 依 ai_provider 選擇接口 ──────────────────────────────────────────────
  const provider = (aiConfig['ai_provider'] ?? process.env['AI_PROVIDER'] ?? 'anthropic').toLowerCase();

  // ── Hermes Agent：獨立分支，走多輪 tool-calling 迴圈而非單輪文字生成 ──────
  if (provider === 'hermes') {
    try {
      const result = await runHermesAgent(systemPrompt, history, userContent, aiConfig['hermes_base_url']);
      if (result.type === 'error')   { res.status(502).json({ error: result.message }); return; }
      if (result.type === 'files')   { res.json({ type: 'files', files: result.files, summary: result.summary ?? '' }); return; }
      res.json({ type: 'question', message: result.message ?? '' });
      return;
    } catch (err: any) {
      res.status(500).json({ error: String(err.message) }); return;
    }
  }

  let aiText = '';

  try {
    if (provider === 'llama') {
      // ── llama.cpp (OpenAI-compatible /v1/chat/completions) ────────────────
      const host  = (aiConfig['llama_host'] ?? 'http://127.0.0.1').replace(/\/$/, '');
      const port  = aiConfig['llama_port'] ?? '8080';
      const url   = `${host}:${port}/v1/chat/completions`;

      const msgs = [
        { role: 'system',    content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user',      content: userContent },
      ];

      const llamaRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, max_tokens: 4096, temperature: 0.3, stream: false }),
      });

      if (!llamaRes.ok) {
        const e = await llamaRes.text();
        res.status(502).json({ error: `llama.cpp API 錯誤（${url}）：${e}` }); return;
      }

      const llamaData = await llamaRes.json() as any;
      aiText = llamaData?.choices?.[0]?.message?.content ?? '';

    } else if (provider === 'openai') {
      // ── OpenAI /v1/chat/completions ───────────────────────────────────────
      const apiKey = process.env['OPENAI_API_KEY'] ?? '';   // Key 只從 .env 讀取
      if (!apiKey) { res.status(503).json({ error: '請在設定頁填入 OpenAI API Key' }); return; }

      const msgs = [
        { role: 'system',    content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user',      content: userContent },
      ];

      const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o', messages: msgs, max_tokens: 4096, temperature: 0.3 }),
      });

      if (!oaiRes.ok) {
        const e = await oaiRes.text();
        res.status(502).json({ error: `OpenAI API 錯誤：${e}` }); return;
      }

      const oaiData = await oaiRes.json() as any;
      aiText = oaiData?.choices?.[0]?.message?.content ?? '';

    } else if (provider === 'custom') {
      // ── 自訂 OpenAI-compatible API ────────────────────────────────────────
      const baseUrl = (aiConfig['custom_base_url'] ?? '').replace(/\/$/, '');
      const apiKey  = aiConfig['custom_api_key'] ?? '';
      const model   = aiConfig['custom_model'] ?? 'local-model';
      if (!baseUrl) { res.status(503).json({ error: '請在設定頁填入自訂 API 的 Base URL' }); return; }

      const msgs = [
        { role: 'system',    content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user',      content: userContent },
      ];

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const custRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: msgs, max_tokens: 4096, temperature: 0.3 }),
      });

      if (!custRes.ok) {
        const e = await custRes.text();
        res.status(502).json({ error: `自訂 API 錯誤（${baseUrl}）：${e}` }); return;
      }

      const custData = await custRes.json() as any;
      aiText = custData?.choices?.[0]?.message?.content ?? '';

    } else {
      // ── Anthropic（預設）────────────────────────────────────────────────
      const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';   // Key 只從 .env 讀取
      if (!apiKey) { res.status(503).json({ error: '請在設定頁填入 Anthropic API Key，或在 .env 設定 ANTHROPIC_API_KEY' }); return; }

      const msgs = [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: userContent },
      ];

      const anthRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: systemPrompt, messages: msgs }),
      });

      if (!anthRes.ok) {
        const e = await anthRes.text();
        res.status(502).json({ error: `Anthropic API 錯誤：${e}` }); return;
      }

      const anthData = await anthRes.json() as any;
      aiText = (anthData.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
    }

    // ── 解析回應 ────────────────────────────────────────────────────────────
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.files) {
          res.json({ type: 'files', files: parsed.files, summary: parsed.summary ?? '' });
          return;
        }
      } catch {}
    }

    res.json({ type: 'question', message: aiText || '（AI 沒有回應，請確認服務正常運作）' });

  } catch (err: any) {
    res.status(500).json({ error: String(err.message) });
  }
});