/**
 * wiki test — F3 測試套件（測試監控）
 * 資料來源：GET /api/tests（後端 mock 或 vitest --reporter=json）
 *
 * 子命令：
 *   ls [--type unit|integration|e2e]   列出所有測試套件
 *   show <id>                          顯示測試套件詳情（含 cases）
 *   run [<id>]                         觸發測試執行
 */

import { parseArgs, apiCall } from '../utils/api.js';
import {
  printBanner, printTable, printSection, printInfo,
  printError, printOk, printWarn, color, statusDot, stars
} from '../utils/print.js';

export async function testCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {

    case 'ls':
    case 'list': {
      printBanner('F3 測試套件 — 測試套件列表');
      try {
        const data = await apiCall('GET', '/api/tests');
        let suites = data.suites ?? [];
        if (flags['type']) suites = suites.filter((s: any) => s.type === flags['type']);

        const rows = suites.map((s: any) => ({
          id:     color.cyan(s.id),
          type:   s.type === 'unit' ? color.blue('unit') : s.type === 'integration' ? color.magenta('integ') : color.yellow('e2e'),
          status: s.status === 'pass' ? color.green('✓ PASS') : s.status === 'fail' ? color.red('✗ FAIL') : color.yellow('⏸ PEND'),
          cases:  `${s.passed}/${s.total}`,
          stars:  stars(s.passed, s.total),
          ms:     s.duration ? `${s.duration}ms` : '—',
          file:   color.dim(s.file ?? ''),
        }));

        printTable(rows, [
          { key:'id',     label:'Suite ID',   width:24 },
          { key:'type',   label:'類型',       width:8  },
          { key:'status', label:'狀態',       width:10 },
          { key:'cases',  label:'通過/總計',  width:10 },
          { key:'stars',  label:'評分',       width:14 },
          { key:'ms',     label:'耗時',       width:8  },
        ]);

        const pass    = suites.filter((s: any) => s.status === 'pass').length;
        const fail    = suites.filter((s: any) => s.status === 'fail').length;
        const pending = suites.filter((s: any) => s.status === 'pending').length;
        printInfo(`共 ${suites.length} 個套件 · ${color.green(pass+' 通過')} · ${color.red(fail+' 失敗')} · ${color.yellow(pending+' 待跑')}`);
      } catch(e: any) {
        printError('無法連線後端 API：' + e.message);
        printInfo('請先執行 wiki serve 啟動後端');
      }
      break;
    }

    case 'show': {
      const id = positional[0];
      if (!id) { printError('請指定 Suite ID。wiki test show <id>'); return; }
      printBanner(`F3 測試套件 — ${id}`);
      try {
        const s = await apiCall('GET', `/api/tests/${id}`);
        printInfo(`檔案：${color.cyan(s.file)}`);
        printInfo(`類型：${s.type}  狀態：${s.status === 'pass' ? color.green('PASS') : s.status === 'fail' ? color.red('FAIL') : color.yellow('PENDING')}`);
        printInfo(`通過：${s.passed}/${s.total}  耗時：${s.duration ?? 0}ms`);
        if (s.lastRun) printInfo(`上次執行：${new Date(s.lastRun).toLocaleString('zh-TW')}`);

        printSection('測試案例');
        (s.cases ?? []).forEach((c: any) => {
          const icon = c.status === 'pass' ? color.green('✓') : c.status === 'fail' ? color.red('✗') : color.dim('○');
          const ms   = c.duration ? color.dim(` (${c.duration}ms)`) : '';
          console.log(`  ${icon} ${c.name}${ms}`);
          if (c.error) console.log(color.red(`      → ${c.error}`));
        });

        const errors = (s.cases ?? []).filter((c: any) => c.error);
        if (errors.length) {
          printSection('錯誤記錄');
          errors.forEach((c: any) => {
            console.log(`  ${color.red('✗')} ${color.bold(c.name)}`);
            console.log(`    ${color.red(c.error)}`);
          });
        }
      } catch(e: any) {
        printError('載入失敗：' + e.message);
      }
      break;
    }

    case 'run': {
      const id = positional[0];
      printBanner('F3 測試套件 — 執行測試');
      try {
        const data = await apiCall('POST', '/api/tests/run', { id });
        printOk(data.message ?? '測試已排入佇列');
        printInfo('請至終端查看 vitest 輸出結果');
      } catch(e: any) {
        printError('觸發失敗：' + e.message);
      }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：ls | show | run');
  }
}
