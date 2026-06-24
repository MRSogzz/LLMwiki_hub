/**
 * LLM WIKI — Metadata Parser Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：監聽 modules/ 與 docs/ 目錄的 Markdown 檔案變更，
 *       即時解析 YAML Front Matter 與 I/O JSON Code Block，
 *       並將解析結果更新至記憶體索引（持久化至 .system/index.json）。
 *
 * 技術選型：
 *   - chokidar    (file watcher)
 *   - gray-matter (YAML Front Matter parser)
 *   - remark + remark-parse (Markdown AST)
 */

import chokidar from 'chokidar';
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleStatus = 'DONE' | 'WIP' | 'BLOCKED';
export type IOType = 'STR' | 'INT' | 'FLOAT' | 'BOOL' | 'ARR' | 'OBJ' | 'ANY' | 'NUM';

export interface IOSchema {
  type: IOType;
  description?: string;
  example?: unknown;
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
  items?: { type: string };
}

export interface ModuleMeta {
  id: number;
  name: string;
  status: ModuleStatus;
  latency: string;
  author: string;
  created: string;
  updated: string;
  tags: string[];
  filePath: string;
  input: IOSchema;
  output: IOSchema;
  description: string;
}

// ── In-memory index ───────────────────────────────────────────────────────────

const moduleIndex = new Map<number, ModuleMeta>();
const INDEX_PATH  = path.resolve('.system/index.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts a JSON code block tagged with //INPUT or //OUTPUT from Markdown body.
 *
 * Matches:
 *   ```json //INPUT
 *   { ... }
 *   ```
 */
function extractIOBlock(body: string, tag: '//INPUT' | '//OUTPUT'): IOSchema | null {
  const escaped = tag.replace(/\//g, '\\/');
  const regex   = new RegExp('```json\\s+' + escaped + '\\s*\\n([\\s\\S]*?)\\n```', 'i');
  const match   = body.match(regex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]!.trim()) as IOSchema;
  } catch (err) {
    console.warn(`[Parser] Failed to parse ${tag} block:`, err);
    return null;
  }
}

/**
 * Extracts a plain-text description from the first paragraph of the Markdown body.
 */
function extractDescription(body: string): string {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(body) as any;
  const firstPara = tree.children?.find((n: any) => n.type === 'paragraph');
  if (!firstPara) return '';
  return (firstPara.children as any[])
    ?.filter((n: any) => n.type === 'text')
    .map((n: any) => n.value as string)
    .join('') ?? '';
}

// ── Core parse function ───────────────────────────────────────────────────────

export async function parseModuleFile(filePath: string): Promise<ModuleMeta | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const { data: fm, content: body } = matter(raw);

  if (!fm['id'] || !fm['name']) {
    console.warn(`[Parser] Missing required YAML fields (id, name) in: ${filePath}`);
    return null;
  }

  const input  = extractIOBlock(body, '//INPUT');
  const output = extractIOBlock(body, '//OUTPUT');

  if (!input || !output) {
    console.warn(`[Parser] Missing //INPUT or //OUTPUT block in: ${filePath}`);
    return null;
  }

  return {
    id:          Number(fm['id']),
    name:        String(fm['name']),
    status:      (fm['status'] as ModuleStatus) ?? 'WIP',
    latency:     String(fm['latency'] ?? '~?ms'),
    author:      String(fm['author']  ?? 'unknown'),
    created:     String(fm['created'] ?? ''),
    updated:     String(fm['updated'] ?? ''),
    tags:        Array.isArray(fm['tags']) ? fm['tags'] as string[] : [],
    filePath,
    input,
    output,
    description: extractDescription(body),
  };
}

// ── Index persistence ─────────────────────────────────────────────────────────

async function persistIndex(): Promise<void> {
  const snapshot = Object.fromEntries(moduleIndex);
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
}

async function loadPersistedIndex(): Promise<void> {
  try {
    const raw  = await fs.readFile(INDEX_PATH, 'utf-8');
    const data = JSON.parse(raw) as Record<string, ModuleMeta>;
    for (const meta of Object.values(data)) {
      moduleIndex.set(meta.id, meta);
    }
    console.log(`[Parser] Loaded ${moduleIndex.size} modules from index cache.`);
  } catch {
    console.log('[Parser] No index cache — starting fresh.');
  }
}

// ── File event handlers ───────────────────────────────────────────────────────

async function handleFileChange(filePath: string): Promise<void> {
  if (!filePath.endsWith('.md')) return;
  console.log(`[Parser] Processing: ${filePath}`);
  const meta = await parseModuleFile(filePath);
  if (meta) {
    moduleIndex.set(meta.id, meta);
    console.log(`[Parser] ✓ Indexed #${meta.id} (${meta.name}) — ${meta.status}`);
    await persistIndex();
  }
}

async function handleFileDelete(filePath: string): Promise<void> {
  for (const [id, meta] of moduleIndex.entries()) {
    if (meta.filePath === filePath) {
      moduleIndex.delete(id);
      console.log(`[Parser] Removed module #${id} from index.`);
      await persistIndex();
      break;
    }
  }
}

// ── Watcher bootstrap ─────────────────────────────────────────────────────────

const WATCH_PATHS = ['modules/**/README.md', 'docs/**/*.md'];

export async function startParser(): Promise<void> {
  await loadPersistedIndex();

  const watcher = chokidar.watch(WATCH_PATHS, {
    persistent:       true,
    ignoreInitial:    false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher
    .on('add',    (p) => void handleFileChange(p))
    .on('change', (p) => void handleFileChange(p))
    .on('unlink', (p) => void handleFileDelete(p))
    .on('ready',  () => console.log('[Parser] Watching for Markdown changes…'));

  process.on('SIGINT', async () => {
    await watcher.close();
    console.log('[Parser] Watcher stopped.');
    process.exit(0);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getModuleIndex(): Map<number, ModuleMeta> { return moduleIndex; }

export function getModuleById(id: number): ModuleMeta | undefined {
  return moduleIndex.get(id);
}

export function searchModules(query: string): ModuleMeta[] {
  const q = query.toLowerCase();
  return [...moduleIndex.values()].filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q))
  );
}

// ── CLI entry (ESM-compatible) ────────────────────────────────────────────────

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('metadata-parser');
if (isMain) {
  startParser().catch(console.error);
}
