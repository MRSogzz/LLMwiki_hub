#!/usr/bin/env node
/**
 * LLM WIKI — CLI 主入口
 * ─────────────────────────────────────────────────────────────────────────────
 * 用法：
 *   wiki <command> [subcommand] [options]
 *
 * 命令總覽：
 *   note     ls|new|read|save|rm          F1 個人日誌（個人筆記）
 *   git      log|status|diff              F2 協作大廳（Git 操作）
 *   test     ls|show|run                  F3 測試套件（測試監控）
 *   milestone ls|show                     F4 專案時程活動（里程碑）
 *   doc      search|read|tree             F5 知識圖鑑（知識庫）
 *   module   ls|show|validate|connect     B  模組背包（模組 I/O）
 *   map      tree|domain                  M  知識雷達（目錄地圖）
 *   vector   build|search                 向量索引
 *   ci       writeback                    CI writeback
 *   serve                                 啟動 API server
 *   help                                  顯示此說明
 *
 * 範例：
 *   wiki note ls
 *   wiki note new "今日筆記"
 *   wiki note read note-2025-06-22.md
 *   wiki git log --limit 10
 *   wiki module validate tokenize embedVec
 *   wiki doc search "型別校驗"
 *   wiki test run unit-parser
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Sub-command routers ───────────────────────────────────────────────────────
import { noteCmd }      from './commands/note.js';
import { gitCmd }       from './commands/git.js';
import { testCmd }      from './commands/test.js';
import { milestoneCmd } from './commands/milestone.js';
import { docCmd }       from './commands/doc.js';
import { moduleCmd }    from './commands/module.js';
import { mapCmd }       from './commands/map.js';
import { vectorCmd }    from './commands/vector.js';
import { ciCmd }        from './commands/ci.js';
import { printHelp, printError } from './utils/print.js';

// ── Parse argv ────────────────────────────────────────────────────────────────
const [, , cmd, ...rest] = process.argv;

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  note:      noteCmd,
  git:       gitCmd,
  test:      testCmd,
  milestone: milestoneCmd,
  doc:       docCmd,
  module:    moduleCmd,
  map:       mapCmd,
  vector:    vectorCmd,
  ci:        ciCmd,
  serve: async () => {
    console.log('Starting LLM WIKI API server...');
    await import('../backend/server.js');
  },
  help: async () => printHelp(),
};

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  const handler = COMMANDS[cmd];
  if (!handler) {
    printError(`Unknown command: "${cmd}"`);
    printHelp();
    process.exit(1);
  }

  try {
    await handler(rest);
  } catch (err: any) {
    printError(err.message ?? String(err));
    process.exit(1);
  }
}

main();
