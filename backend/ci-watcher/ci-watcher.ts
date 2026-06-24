/**
 * LLM WIKI — CI/CD Validation Watcher (writeback)
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：在每次 CI/CD Pipeline 部署後，
 *       1. 捕獲生產環境的真實 I/O 數據與 Latency
 *       2. 將結果寫回對應模組的 README.md（更新 status 與 latency）
 *       3. 生成 Git commit：[ci] update module#XXX status=DONE lat=Xms
 *
 * 使用方式（CLI）：
 *   npm run ci-writeback -- --module=1 --status=DONE --latency=~4ms --name=schemaVal
 *
 * 使用方式（程式呼叫）：
 *   import { writebackResult } from './ci-watcher.js';
 *   await writebackResult({ moduleId: 1, status: 'DONE', ... });
 */

import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleStatus = 'DONE' | 'WIP' | 'BLOCKED';

export interface CIResult {
  moduleId:     number;
  moduleName:   string;
  status:       ModuleStatus;
  latency:      string;
  testsPassed:  number;
  testsFailed:  number;
  capturedAt:   string;
  notes?:       string;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function findModuleReadme(moduleId: number): string | null {
  const modulesDir = path.resolve('modules');
  if (!fss.existsSync(modulesDir)) return null;

  const dirs = fss.readdirSync(modulesDir, { withFileTypes: true });
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const candidate = path.join(modulesDir, dirent.name, 'README.md');
    if (!fss.existsSync(candidate)) continue;

    try {
      const raw        = fss.readFileSync(candidate, 'utf-8');
      const { data }   = matter(raw);
      if (Number(data['id']) === moduleId) return candidate;
    } catch { /* skip unreadable */ }
  }
  return null;
}

// ── Front matter updater ──────────────────────────────────────────────────────

async function updateModuleReadme(filePath: string, result: CIResult): Promise<void> {
  const raw              = await fs.readFile(filePath, 'utf-8');
  const { data: fm, content: body } = matter(raw);

  fm['status']  = result.status;
  fm['latency'] = result.latency;
  fm['updated'] = result.capturedAt.slice(0, 10);

  const ciLogEntry = [
    '',
    '---',
    '',
    '## CI/CD Run Log',
    '',
    '| 欄位       | 值 |',
    '|------------|---|',
    `| 執行時間   | ${result.capturedAt} |`,
    `| 狀態       | **${result.status}** |`,
    `| 延遲       | ${result.latency} |`,
    `| 測試通過   | ${result.testsPassed} |`,
    `| 測試失敗   | ${result.testsFailed} |`,
    result.notes ? `| 備注       | ${result.notes} |` : '',
  ].filter(l => l !== undefined).join('\n');

  // Remove old CI log section, append fresh one
  const bodyWithoutLog = body.replace(/\n---\n\n## CI\/CD Run Log[\s\S]*$/, '');
  const newContent     = matter.stringify(bodyWithoutLog + ciLogEntry, fm);

  await fs.writeFile(filePath, newContent, 'utf-8');
}

// ── Git commit helper ─────────────────────────────────────────────────────────

function gitCommitWriteback(result: CIResult, filePath: string): void {
  const idStr = String(result.moduleId).padStart(3, '0');
  const msg   = `[ci] update module#${idStr} status=${result.status} lat=${result.latency}`;
  try {
    execSync(`git add "${filePath}"`, { stdio: 'pipe' });
    execSync(`git commit -m "${msg}"`, { stdio: 'pipe' });
    console.log(`[CI Watcher] Git commit: ${msg}`);
  } catch {
    console.warn('[CI Watcher] Git commit skipped (not a repo or nothing to commit).');
  }
}

// ── System CI log ─────────────────────────────────────────────────────────────

const SYSTEM_LOG_PATH = path.resolve('.system/ci/ci-runs.json');

async function appendSystemLog(result: CIResult): Promise<void> {
  let history: CIResult[] = [];
  try {
    const raw = await fs.readFile(SYSTEM_LOG_PATH, 'utf-8');
    history   = JSON.parse(raw) as CIResult[];
  } catch { /* first run */ }

  history.unshift(result);
  if (history.length > 200) history = history.slice(0, 200);

  await fs.mkdir(path.dirname(SYSTEM_LOG_PATH), { recursive: true });
  await fs.writeFile(SYSTEM_LOG_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function writebackResult(result: CIResult): Promise<void> {
  console.log(`[CI Watcher] Processing module #${result.moduleId} (${result.moduleName})…`);

  const readmePath = findModuleReadme(result.moduleId);
  if (!readmePath) {
    console.error(`[CI Watcher] README.md not found for module #${result.moduleId}`);
    await appendSystemLog(result);
    return;
  }

  await updateModuleReadme(readmePath, result);
  console.log(`[CI Watcher] ✓ Updated: ${readmePath}`);

  await appendSystemLog(result);
  console.log(`[CI Watcher] ✓ System log updated`);

  gitCommitWriteback(result, readmePath);
}

// ── CLI entry (ESM-compatible) ────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => {
        const eqIdx = a.indexOf('=');
        return eqIdx > 0
          ? [a.slice(2, eqIdx), a.slice(eqIdx + 1)]
          : [a.slice(2), 'true'];
      })
  ) as Record<string, string>;

  if (!args['module'] || !args['status']) {
    console.error(
      'Usage: npm run ci-writeback -- ' +
      '--module=<id> --status=<DONE|WIP|BLOCKED> ' +
      '[--latency=~Xms] [--name=<moduleName>] [--pass=N] [--fail=N]'
    );
    process.exit(1);
  }

  await writebackResult({
    moduleId:    Number(args['module']),
    moduleName:  args['name']    ?? `module-${args['module']}`,
    status:      args['status']  as ModuleStatus,
    latency:     args['latency'] ?? '~?ms',
    testsPassed: Number(args['pass'] ?? 0),
    testsFailed: Number(args['fail'] ?? 0),
    capturedAt:  new Date().toISOString(),
    notes:       args['notes'],
  });
}

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('ci-watcher');
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
