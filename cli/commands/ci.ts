/**
 * wiki ci — CI writeback
 * 儲存位置：modules/<name>/README.md（更新 YAML status/latency）
 *           .system/ci/ci-runs.json（執行記錄）
 */
import fss from 'fs';
import { parseArgs, apiCall, CI_LOG_PATH } from '../utils/api.js';
import { printBanner, printInfo, printError, printOk, printTable, color } from '../utils/print.js';

export async function ciCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {
    case 'writeback': {
      printBanner('CI Writeback — 更新模組狀態');
      const moduleId   = Number(flags['module'] ?? flags['id'] ?? positional[0]);
      const status     = String(flags['status']  ?? 'DONE') as 'DONE'|'WIP'|'BLOCKED';
      const latency    = String(flags['latency'] ?? flags['lat'] ?? '~?ms');
      const moduleName = String(flags['name']    ?? `module-${moduleId}`);
      const pass       = Number(flags['pass']    ?? 0);
      const fail       = Number(flags['fail']    ?? 0);
      const notes      = flags['notes'] as string | undefined;

      if (!moduleId) { printError('請提供模組 ID：--module <id>'); return; }

      printInfo(`模組 ID   ：${moduleId}`);
      printInfo(`狀態      ：${status === 'DONE' ? color.green(status) : status === 'BLOCKED' ? color.red(status) : color.yellow(status)}`);
      printInfo(`延遲      ：${latency}`);
      printInfo(`寫入目標  ：${color.cyan('modules/'+moduleName+'/README.md')}`);
      printInfo(`執行記錄  ：${color.cyan('.system/ci/ci-runs.json')}`);

      try {
        await apiCall('POST', '/api/ci/writeback', {
          moduleId, moduleName, status, latency,
          testsPassed: pass, testsFailed: fail,
          capturedAt: new Date().toISOString(), notes,
        });
        printOk(`模組 #${moduleId} 已更新：status=${status}  latency=${latency}`);
      } catch(e:any) { printError('Writeback 失敗：'+e.message); }
      break;
    }

    case 'log': {
      printBanner('CI Writeback — 執行記錄');
      printInfo(`記錄位置：${color.cyan('.system/ci/ci-runs.json')}`);
      if (!fss.existsSync(CI_LOG_PATH)) { printInfo('尚無執行記錄'); return; }
      const runs = JSON.parse(fss.readFileSync(CI_LOG_PATH,'utf-8'));
      const rows = (runs as any[]).slice(0, 20).map((r: any) => ({
        time:   new Date(r.capturedAt).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),
        id:     color.dim('#'+String(r.moduleId).padStart(3,'0')),
        name:   r.moduleName,
        status: r.status==='DONE' ? color.green('DONE') : r.status==='BLOCKED' ? color.red('BLOCKED') : color.yellow('WIP'),
        lat:    r.latency,
        pass:   String(r.testsPassed),
        fail:   r.testsFailed > 0 ? color.red(String(r.testsFailed)) : color.dim('0'),
      }));
      printTable(rows, [
        { key:'time',   label:'時間',   width:14 },
        { key:'id',     label:'ID',     width:6  },
        { key:'name',   label:'模組',   width:18 },
        { key:'status', label:'狀態',   width:10 },
        { key:'lat',    label:'延遲',   width:10 },
        { key:'pass',   label:'通過',   width:6  },
        { key:'fail',   label:'失敗',   width:6  },
      ]);
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：writeback | log');
  }
}
