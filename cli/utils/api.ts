/**
 * CLI API 工具
 * 所有 CLI 指令透過此模組與後端 API 溝通，
 * 若 API 不可用則部分指令直接讀取檔案系統。
 */

import fss from 'fs';
import path from 'path';

export const API_BASE = process.env['WIKI_API'] ?? 'http://localhost:3001';

/** 呼叫後端 API */
export async function apiCall<T = any>(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  body?: object,
): Promise<T> {
  const res = await fetch(API_BASE + endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

/** 解析 --flag value 或 --flag=value 形式的 args */
export function parseArgs(args: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const eqIdx = a.indexOf('=');
      if (eqIdx > 0) {
        flags[a.slice(2, eqIdx)] = a.slice(eqIdx + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }

  return { positional, flags };
}

/** 取得根目錄（往上找 package.json） */
export function findRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fss.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const ROOT         = findRoot();
export const NOTES_DIR    = path.join(ROOT, '.system', 'user', 'notes');
export const MODULES_DIR  = path.join(ROOT, 'modules');
export const DOCS_DIR     = path.join(ROOT, 'docs');
export const MILESTONES_DIR = path.join(ROOT, 'milestones');
export const SYSTEM_DIR   = path.join(ROOT, '.system');
export const CI_LOG_PATH  = path.join(SYSTEM_DIR, 'ci', 'ci-runs.json');
export const INDEX_PATH   = path.join(SYSTEM_DIR, 'index.json');
export const VECTOR_CACHE = path.join(SYSTEM_DIR, 'vector-cache.json');
