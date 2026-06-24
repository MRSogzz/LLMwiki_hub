/**
 * wiki note — F1 個人日誌
 * 儲存位置：.system/user/notes/*.md
 *
 * 子命令：
 *   ls                         列出所有筆記
 *   new <title> [--content <text>]  新增筆記（自動以今日日期命名）
 *   read <filename>            讀取筆記內容
 *   save <filename> [--content <text>]  覆寫筆記（不提供 content 則開啟 $EDITOR）
 *   rm <filename>              刪除筆記
 */

import fs   from 'fs/promises';
import fss  from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseArgs, NOTES_DIR, apiCall } from '../utils/api.js';
import { printBanner, printTable, printOk, printError, printInfo, printSection, color, printWarn } from '../utils/print.js';

async function ensureNotesDir() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
}

export async function noteCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {

    // ── ls ──────────────────────────────────────────────────────────────────
    case 'ls':
    case 'list': {
      printBanner('F1 個人日誌 — 筆記列表');
      printInfo(`儲存位置：${color.cyan(NOTES_DIR)}`);
      await ensureNotesDir();
      const files = (await fs.readdir(NOTES_DIR)).filter(f => f.endsWith('.md'));
      if (!files.length) { printInfo('尚無筆記。使用 wiki note new <title> 建立。'); return; }
      const rows = await Promise.all(files.map(async f => {
        const stat = await fs.stat(path.join(NOTES_DIR, f));
        const raw  = await fs.readFile(path.join(NOTES_DIR, f), 'utf-8');
        return {
          filename: f,
          size:     `${stat.size}B`,
          modified: stat.mtime.toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
          preview:  raw.slice(0, 50).replace(/\n/g, ' '),
        };
      }));
      rows.sort((a,b) => b.modified.localeCompare(a.modified));
      printTable(rows, [
        { key:'filename', label:'檔案名稱', width:28 },
        { key:'size',     label:'大小',     width:8  },
        { key:'modified', label:'修改時間', width:16 },
        { key:'preview',  label:'預覽',     width:50 },
      ]);
      printInfo(`共 ${files.length} 篇筆記`);
      break;
    }

    // ── new ─────────────────────────────────────────────────────────────────
    case 'new':
    case 'add': {
      const title   = positional[0] ?? '無標題';
      const today   = new Date().toISOString().slice(0, 10);
      const slug    = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-').slice(0, 40);
      const filename= flags['name'] as string ?? `note-${today}-${slug}.md`;
      const filepath = path.join(NOTES_DIR, filename);

      let content: string;
      if (flags['content']) {
        content = String(flags['content']);
      } else {
        content = `# ${title}\n\n> 建立於 ${new Date().toLocaleString('zh-TW')}\n\n`;
      }

      await ensureNotesDir();
      if (fss.existsSync(filepath) && !flags['force']) {
        printWarn(`${filename} 已存在。使用 --force 強制覆寫。`);
        return;
      }
      await fs.writeFile(filepath, content, 'utf-8');
      printOk(`筆記已建立：${color.cyan(filename)}`);
      printInfo(`路徑：${filepath}`);
      printInfo(`字數：${content.length} 字元`);
      break;
    }

    // ── read ────────────────────────────────────────────────────────────────
    case 'read':
    case 'cat': {
      const filename = positional[0];
      if (!filename) { printError('請指定檔名。wiki note read <filename>'); return; }
      const filepath = path.join(NOTES_DIR, filename.endsWith('.md') ? filename : filename + '.md');
      if (!fss.existsSync(filepath)) { printError(`找不到筆記：${filename}`); return; }
      const content = await fs.readFile(filepath, 'utf-8');
      printSection(filename);
      console.log(content);
      printInfo(`路徑：${filepath}`);
      break;
    }

    // ── save ────────────────────────────────────────────────────────────────
    case 'save':
    case 'write': {
      const filename = positional[0];
      if (!filename) { printError('請指定檔名。wiki note save <filename> --content <text>'); return; }
      const filepath = path.join(NOTES_DIR, filename.endsWith('.md') ? filename : filename + '.md');
      await ensureNotesDir();

      let content: string;
      if (flags['content']) {
        content = String(flags['content']);
      } else if (flags['append']) {
        const existing = fss.existsSync(filepath) ? await fs.readFile(filepath, 'utf-8') : '';
        content = existing + '\n' + String(flags['append']);
      } else {
        // 開啟 $EDITOR
        const editor = process.env['EDITOR'] ?? 'vi';
        const tmpFile = `/tmp/wiki-note-${Date.now()}.md`;
        const existing = fss.existsSync(filepath) ? await fs.readFile(filepath, 'utf-8') : '';
        await fs.writeFile(tmpFile, existing, 'utf-8');
        try {
          execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
          content = await fs.readFile(tmpFile, 'utf-8');
          await fs.unlink(tmpFile);
        } catch {
          printError('編輯器開啟失敗。請使用 --content 直接提供內容。');
          return;
        }
      }

      await fs.writeFile(filepath, content, 'utf-8');
      printOk(`筆記已儲存：${color.cyan(filename)}`);
      printInfo(`字元數：${content.length}`);
      break;
    }

    // ── rm ──────────────────────────────────────────────────────────────────
    case 'rm':
    case 'delete':
    case 'del': {
      const filename = positional[0];
      if (!filename) { printError('請指定檔名。wiki note rm <filename>'); return; }
      const filepath = path.join(NOTES_DIR, filename.endsWith('.md') ? filename : filename + '.md');
      if (!fss.existsSync(filepath)) { printError(`找不到筆記：${filename}`); return; }
      await fs.unlink(filepath);
      printOk(`已刪除：${filename}`);
      break;
    }

    // ── append ──────────────────────────────────────────────────────────────
    case 'append': {
      const filename = positional[0];
      const text     = flags['text'] as string ?? positional[1];
      if (!filename || !text) { printError('用法：wiki note append <filename> --text <內容>'); return; }
      const filepath = path.join(NOTES_DIR, filename.endsWith('.md') ? filename : filename + '.md');
      await ensureNotesDir();
      const existing = fss.existsSync(filepath) ? await fs.readFile(filepath, 'utf-8') : '';
      await fs.writeFile(filepath, existing + '\n' + text, 'utf-8');
      printOk(`已附加到 ${filename}`);
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：ls | new | read | save | rm | append');
  }
}
