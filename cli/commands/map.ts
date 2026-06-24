/**
 * wiki map — M 知識雷達
 * 儲存位置：docs/ 目錄樹
 */
import { parseArgs, apiCall } from '../utils/api.js';
import { printBanner, printInfo, printError, color } from '../utils/print.js';

export async function mapCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional } = parseArgs(rest);

  switch (sub ?? 'tree') {
    case 'tree': {
      printBanner('M 知識雷達 — 三層目錄地圖');
      printInfo(`來源：${color.cyan('docs/**/*.md')}`);
      try {
        const d = await apiCall('GET', '/api/docs/tree');
        let total = 0;
        function render(nodes: any[], depth = 0) {
          nodes.forEach(n => {
            const pad = '  '.repeat(depth + 1);
            if (n.type === 'dir') {
              console.log(`${pad}${color.blue('📂 ')}${color.bold(n.name)}/`);
              if (n.children?.length) render(n.children, depth + 1);
            } else {
              console.log(`${pad}${color.dim('└─ 📄 ')}${color.dim(n.name)}`);
              total++;
            }
          });
        }
        if (!d.tree?.length) { printInfo('docs/ 目錄尚無文件'); return; }
        render(d.tree);
        console.log();
        printInfo(`共 ${total} 個文件`);
      } catch(e:any) { printError('載入失敗：'+e.message); }
      break;
    }

    case 'domain': {
      const domain = positional[0];
      printBanner(`M 知識雷達 — Domain: ${domain ?? '全部'}`);
      try {
        const d = await apiCall('GET', '/api/docs/tree');
        const nodes = domain
          ? (d.tree ?? []).filter((n: any) => n.name === domain)
          : d.tree ?? [];
        function render(nodes: any[], depth = 0) {
          nodes.forEach(n => {
            const pad = '  '.repeat(depth + 1);
            if (n.type === 'dir') {
              console.log(`${pad}${color.blue('📂 ')}${color.bold(n.name)}`);
              if (n.children?.length) render(n.children, depth + 1);
            } else {
              console.log(`${pad}${color.dim('📄 ')}${n.name}`);
            }
          });
        }
        render(nodes);
      } catch(e:any) { printError('載入失敗：'+e.message); }
      break;
    }

    default:
      printError(`未知子命令：${sub}`);
      printInfo('可用子命令：tree | domain [name]');
  }
}
