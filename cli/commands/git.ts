/**
 * wiki git — F2 協作大廳
 * 資料來源：.git（透過 simple-git）
 *
 * 子命令：
 *   log [--limit N] [--author name]   顯示 commit 記錄
 *   status                            工作目錄狀態
 *   diff [filename]                   顯示差異
 */

import simpleGit from 'simple-git';
import path      from 'path';
import { parseArgs, ROOT } from '../utils/api.js';
import { printBanner, printSection, printInfo, printError, printOk, printWarn, printTable, color, statusDot } from '../utils/print.js';

export async function gitCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);
  const git = simpleGit(ROOT);

  switch (sub) {

    // ── log ─────────────────────────────────────────────────────────────────
    case 'log':
    case 'commits': {
      printBanner('F2 協作大廳 — Commit 記錄');
      const limit  = Number(flags['limit'] ?? flags['n'] ?? 20);
      const author = flags['author'] as string | undefined;
      try {
        const log = await git.log({ maxCount: limit, '--author': author });
        const rows = log.all.map(c => ({
          hash:    color.cyan(c.hash.slice(0, 7)),
          author:  c.author_name,
          date:    new Date(c.date).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
          message: c.message.slice(0, 50),
        }));
        printTable(rows, [
          { key:'hash',    label:'Hash',   width:10 },
          { key:'author',  label:'作者',   width:14 },
          { key:'date',    label:'時間',   width:16 },
          { key:'message', label:'訊息',   width:52 },
        ]);
        printInfo(`顯示最近 ${rows.length} 筆 commit（.git 目錄：${ROOT}）`);
      } catch(e: any) {
        printError('非 Git 倉庫或 Git 未安裝：' + e.message);
      }
      break;
    }

    // ── status ──────────────────────────────────────────────────────────────
    case 'status':
    case 'st': {
      printBanner('F2 協作大廳 — 工作目錄狀態');
      try {
        const s = await git.status();
        printInfo(`分支：${color.cyan(s.current ?? 'unknown')}`);
        if (s.ahead)  printOk(`超前遠端 ${s.ahead} 個 commit`);
        if (s.behind) printWarn(`落後遠端 ${s.behind} 個 commit`);

        if (s.staged.length) {
          printSection('已暫存 (staged)');
          s.staged.forEach(f => console.log(`  ${color.green('✚')} ${f}`));
        }
        if (s.modified.length) {
          printSection('已修改 (modified)');
          s.modified.forEach(f => console.log(`  ${color.yellow('±')} ${f}`));
        }
        if (s.not_added.length) {
          printSection('未追蹤 (untracked)');
          s.not_added.forEach(f => console.log(`  ${color.dim('?')} ${f}`));
        }
        if (!s.staged.length && !s.modified.length && !s.not_added.length) {
          printOk('工作目錄乾淨');
        }
      } catch(e: any) {
        printError('非 Git 倉庫：' + e.message);
      }
      break;
    }

    // ── diff ────────────────────────────────────────────────────────────────
    case 'diff': {
      const file = positional[0];
      try {
        const diff = file
          ? await git.diff(['HEAD', '--', file])
          : await git.diff(['HEAD']);
        if (!diff.trim()) { printInfo('無差異'); return; }
        diff.split('\n').forEach(line => {
          if (line.startsWith('+') && !line.startsWith('+++')) console.log(color.green(line));
          else if (line.startsWith('-') && !line.startsWith('---')) console.log(color.red(line));
          else if (line.startsWith('@@')) console.log(color.cyan(line));
          else console.log(color.dim(line));
        });
      } catch(e: any) {
        printError('diff 失敗：' + e.message);
      }
      break;
    }

    // ── branch ──────────────────────────────────────────────────────────────
    case 'branch':
    case 'branches': {
      printBanner('F2 協作大廳 — 分支列表');
      try {
        const branches = await git.branch(['-a', '--sort=-committerdate']);
        branches.all.forEach(b => {
          const isCurrent = b === branches.current;
          const icon = isCurrent ? color.green('▶') : color.dim('○');
          console.log(`  ${icon} ${isCurrent ? color.bold(b) : color.dim(b)}`);
        });
        printInfo(`當前分支：${color.cyan(branches.current)}`);
      } catch(e: any) {
        printError('非 Git 倉庫：' + e.message);
      }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：log | status | diff | branch');
  }
}
