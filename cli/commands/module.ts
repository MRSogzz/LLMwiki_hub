/**
 * wiki module — B 模組背包
 * 儲存位置：modules/<name>/README.md（YAML Front Matter + I/O JSON Block）
 */
import { parseArgs, apiCall } from '../utils/api.js';
import { printBanner, printTable, printSection, printInfo, printError, printOk, printWarn, color, statusDot } from '../utils/print.js';

const TC: Record<string,string> = { STR:'\x1b[34m',INT:'\x1b[32m',FLOAT:'\x1b[33m',FLT:'\x1b[33m',BOOL:'\x1b[33m',ARR:'\x1b[35m',OBJ:'\x1b[31m',ANY:'\x1b[90m',NUM:'\x1b[36m' };
const typeColor = (t: string) => (TC[t] ?? '') + t + '\x1b[0m';

export async function moduleCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {
    case 'ls':
    case 'list': {
      printBanner('B 模組背包 — 模組列表');
      printInfo(`來源：${color.cyan('modules/*/README.md')}`);
      try {
        const d = await apiCall('GET', '/api/modules');
        let modules = d.modules ?? [];
        if (flags['status']) modules = modules.filter((m:any) => m.status === String(flags['status']).toUpperCase());
        const rows = modules.map((m:any) => ({
          id:     color.dim(String(m.id).padStart(2,'0')),
          name:   color.bold(m.name+'()'),
          input:  typeColor(m.input?.type ?? '?'),
          output: typeColor(m.output?.type ?? '?'),
          status: m.status==='DONE' ? color.green('✓ DONE') : m.status==='BLOCKED' ? color.red('✗ BLOCKED') : color.yellow('… WIP'),
          lat:    m.latency ?? '—',
          tags:   (m.tags??[]).slice(0,3).join(', '),
        }));
        printTable(rows, [
          { key:'id',    label:'#',      width:4  },
          { key:'name',  label:'函數名', width:22 },
          { key:'input', label:'INPUT',  width:10 },
          { key:'output',label:'OUTPUT', width:10 },
          { key:'status',label:'狀態',   width:14 },
          { key:'lat',   label:'延遲',   width:10 },
          { key:'tags',  label:'標籤',   width:30 },
        ]);
        printInfo(`共 ${modules.length} 個模組  來源：modules/*/README.md`);
      } catch(e:any) { printError('載入失敗：'+e.message); }
      break;
    }

    case 'show': {
      const nameOrId = positional[0];
      if (!nameOrId) { printError('請指定模組名稱或 ID'); return; }
      try {
        const d  = await apiCall('GET', '/api/modules');
        const m  = (d.modules??[]).find((x:any) => String(x.id)===nameOrId || x.name===nameOrId);
        if (!m) { printError(`找不到模組：${nameOrId}`); return; }
        printBanner(`B 模組背包 — ${m.name}()`);
        printInfo(`ID：#${String(m.id).padStart(3,'0')}  狀態：${m.status}  延遲：${m.latency ?? '—'}`);
        printInfo(`檔案：modules/${m.name}/README.md`);
        printSection('I/O 規格');
        console.log(`  INPUT  : ${typeColor(m.input?.type ?? '?')}  ${color.dim(m.input?.description ?? '')}`);
        console.log(`  OUTPUT : ${typeColor(m.output?.type ?? '?')}  ${color.dim(m.output?.description ?? '')}`);
        if (m.description) { printSection('說明'); console.log('  '+m.description); }
        if (m.tags?.length) printInfo(`標籤：${m.tags.join('、')}`);
      } catch(e:any) { printError('載入失敗：'+e.message); }
      break;
    }

    case 'validate': {
      const [nameA, nameB] = positional;
      if (!nameA || !nameB) { printError('用法：wiki module validate <moduleA> <moduleB>'); return; }
      printBanner('B 模組背包 — 型別校驗');
      try {
        const d    = await apiCall('GET', '/api/modules');
        const mods = d.modules ?? [];
        const mA   = mods.find((m:any) => m.name===nameA || String(m.id)===nameA);
        const mB   = mods.find((m:any) => m.name===nameB || String(m.id)===nameB);
        if (!mA) { printError(`找不到模組：${nameA}`); return; }
        if (!mB) { printError(`找不到模組：${nameB}`); return; }
        const result = await apiCall('POST', '/api/validate', { moduleIdA: mA.id, moduleIdB: mB.id });
        if (result.compatible) {
          printOk(`${color.bold(nameA)}() [OUT:${typeColor(result.outputType)}] → ${color.bold(nameB)}() [IN:${typeColor(result.inputType)}]`);
          printOk('型別相容 ✓');
        } else {
          printError(`TypeMismatchException：${nameA}() 輸出 ${result.outputType} ≠ ${nameB}() 需要 ${result.inputType}`);
          if (result.adapterSuggestion) printInfo(`建議 Adapter：${color.cyan(result.adapterSuggestion)}`);
        }
      } catch(e:any) { printError('校驗失敗：'+e.message); }
      break;
    }

    case 'connect':
    case 'pipeline': {
      if (positional.length < 2) { printError('用法：wiki module connect <mod1> <mod2> [mod3...]'); return; }
      printBanner('B 模組背包 — Pipeline 校驗');
      try {
        const d    = await apiCall('GET', '/api/modules');
        const mods = d.modules ?? [];
        const ids  = positional.map(name => {
          const m = mods.find((x:any) => x.name===name || String(x.id)===name);
          if (!m) throw new Error(`找不到模組：${name}`);
          return m.id;
        });
        const result = await apiCall('POST', '/api/validate/pipeline', { moduleIds: ids });
        result.steps.forEach((step: any, i: number) => {
          const arrow = step.compatible ? color.green(' → ') : color.red(' ✗ ');
          console.log(`  ${color.dim(String(i+1)+'.').padEnd(4)}${color.bold(positional[i]!)}${arrow}${color.bold(positional[i+1]!)}  ${step.compatible ? color.green('OK') : color.red('FAIL')}`);
          if (!step.compatible) {
            console.log(`       ${color.red(step.message)}`);
            if (step.adapterSuggestion) console.log(`       建議：${color.cyan(step.adapterSuggestion)}`);
          }
        });
        console.log();
        if (result.valid) printOk('Pipeline 全段相容 ✓');
        else printError('Pipeline 存在型別不符，請參考上方錯誤');
      } catch(e:any) { printError('校驗失敗：'+e.message); }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：ls | show | validate | connect');
  }
}
