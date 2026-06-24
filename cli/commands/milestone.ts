/**
 * wiki milestone — F4 目標專案時程
 * 儲存位置：milestones/*.md（YAML Front Matter）
 *
 * 子命令：
 *   ls              列出所有里程碑（含進度條）
 *   show <filename> 顯示單一里程碑詳情
 */

import { parseArgs, apiCall } from '../utils/api.js';
import {
  printBanner, printSection, printInfo, printError,
  color, progressBar, statusDot, printTable
} from '../utils/print.js';

export async function milestoneCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional } = parseArgs(rest);

  switch (sub) {

    case 'ls':
    case 'list': {
      printBanner('F4 專案時程活動 — 里程碑列表');
      printInfo(`儲存位置：${color.cyan('milestones/*.md')}`);
      try {
        const data = await apiCall('GET', '/api/milestones');
        const ms   = data.milestones ?? [];
        if (!ms.length) { printInfo('milestones/ 目錄尚無文件'); return; }

        ms.forEach((m: any) => {
          const dot = m.completion === 100 ? color.green('🏆') : m.completion >= 60 ? color.yellow('⚡') : color.dim('📌');
          console.log(`\n  ${dot} ${color.bold(m.title)}`);
          console.log(`     ${progressBar(m.completion)}`);
          console.log(`     ${color.dim(`${m.doneTasks}/${m.totalTasks} 任務完成  ${m.due ? '· 截止 '+m.due : ''}  · ${m.status}`)}`);
          if (m.tags?.length) console.log(`     ${m.tags.map((t: string) => color.cyan('['+t+']')).join(' ')}`);
        });
        console.log();
        printInfo(`共 ${ms.length} 個里程碑`);
      } catch(e: any) {
        printError('無法連線後端：' + e.message);
        printInfo('請先執行 wiki serve');
      }
      break;
    }

    case 'show': {
      const filename = positional[0];
      if (!filename) { printError('請指定檔名。wiki milestone show <filename>'); return; }
      try {
        // 嘗試從 API 拿全部，再篩選
        const data = await apiCall('GET', '/api/milestones');
        const m = (data.milestones ?? []).find((x: any) =>
          x.filename === filename || x.filename === filename + '.md' || x.title.includes(filename)
        );
        if (!m) { printError(`找不到里程碑：${filename}`); return; }

        printBanner(`F4 — ${m.title}`);
        console.log(`  ${progressBar(m.completion)}`);
        printInfo(`狀態：${m.status}  完成度：${m.completion}%`);
        printInfo(`任務：${m.doneTasks}/${m.totalTasks}`);
        if (m.due) printInfo(`截止日：${m.due}`);
        if (m.tags?.length) printInfo(`標籤：${m.tags.join('、')}`);
        printInfo(`檔案：milestones/${m.filename}`);
      } catch(e: any) {
        printError('載入失敗：' + e.message);
      }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：ls | show');
  }
}
