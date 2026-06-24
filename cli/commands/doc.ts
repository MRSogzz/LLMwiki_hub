/**
 * wiki doc — F5 知識圖鑑
 * 儲存位置：docs/**/*.md
 */
import fs  from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { parseArgs, apiCall, DOCS_DIR } from '../utils/api.js';
import { printBanner, printSection, printInfo, printError, printOk, color } from '../utils/print.js';

export async function docCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {
    case 'search': {
      const q = positional[0] ?? flags['q'] as string;
      if (!q) { printError('請提供搜尋關鍵字。wiki doc search <keyword>'); return; }
      printBanner('F5 知識圖鑑 — 文件搜尋');
      printInfo(`搜尋：${color.cyan(q)}  來源：${color.cyan('docs/**/*.md')}`);
      try {
        const d = await apiCall('GET', `/api/docs/search?q=${encodeURIComponent(q)}`);
        if (!d.results?.length) { printInfo('找不到符合文件'); return; }
        d.results.forEach((r: any, i: number) => {
          console.log(`\n  ${color.cyan(`[${i+1}]`)} ${color.bold(r.title)}`);
          console.log(`       ${color.dim(r.path)}`);
          console.log(`       ${r.excerpt}`);
          if (r.tags?.length) console.log(`       ${r.tags.map((t:string)=>color.cyan('['+t+']')).join(' ')}`);
        });
        console.log();
        printInfo(`共 ${d.count} 筆結果`);
      } catch(e:any) { printError('搜尋失敗：'+e.message); }
      break;
    }
    case 'read':
    case 'cat': {
      const p = positional[0];
      if (!p) { printError('請指定路徑。wiki doc read <path>'); return; }
      try {
        const d = await apiCall('GET', `/api/docs/file?path=${encodeURIComponent(p)}`);
        printSection(p);
        console.log(d.content);
        printInfo(`路徑：docs/${p}`);
      } catch(e:any) {
        // fallback: 直接讀檔
        const full = path.join(DOCS_DIR, p);
        if (fss.existsSync(full)) {
          const content = await fs.readFile(full, 'utf-8');
          printSection(p);
          console.log(content);
        } else { printError('找不到文件：'+p); }
      }
      break;
    }
    case 'tree': {
      printBanner('F5 知識圖鑑 — 目錄樹');
      printInfo(`來源：${color.cyan('docs/**/*.md')}`);
      try {
        const d = await apiCall('GET', '/api/docs/tree');
        function renderTree(nodes: any[], depth = 0) {
          nodes.forEach(n => {
            const indent = '  '.repeat(depth + 1);
            if (n.type === 'dir') {
              console.log(`${indent}${color.blue('📂')} ${color.bold(n.name)}`);
              if (n.children?.length) renderTree(n.children, depth + 1);
            } else {
              console.log(`${indent}${color.dim('📄')} ${color.dim(n.name)}`);
            }
          });
        }
        if (!d.tree?.length) { printInfo('docs/ 目錄尚無文件'); return; }
        renderTree(d.tree);
      } catch(e:any) { printError('載入失敗：'+e.message); }
      break;
    }
    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：search | read | tree');
  }
}
