/**
 * wiki vector — 向量索引
 * 儲存位置：.system/vector-cache.json
 */
import fss from 'fs';
import { parseArgs, apiCall, VECTOR_CACHE } from '../utils/api.js';
import { printBanner, printInfo, printError, printOk, printWarn, color } from '../utils/print.js';

export async function vectorCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {
    case 'build': {
      printBanner('向量索引 — 重建');
      printInfo(`快取位置：${color.cyan('.system/vector-cache.json')}`);
      printWarn('此操作需要 OPENAI_API_KEY，費用依 tokens 計算');
      try {
        const { VectorIndex } = await import('../../backend/vector/vector-index.js');
        const idx = new VectorIndex();
        await idx.build(true);
        printOk(`向量索引重建完成，${idx.size} 個條目`);
        printInfo(`快取：${VECTOR_CACHE}`);
      } catch(e:any) { printError('重建失敗：'+e.message); }
      break;
    }

    case 'search': {
      const q = positional[0] ?? flags['q'] as string;
      if (!q) { printError('請提供搜尋詞。wiki vector search <query>'); return; }
      const topK = Number(flags['top'] ?? flags['k'] ?? 5);
      printBanner('向量索引 — 語意搜尋');
      printInfo(`查詢：${color.cyan(q)}  Top-K：${topK}`);
      try {
        const { VectorIndex } = await import('../../backend/vector/vector-index.js');
        const idx = new VectorIndex();
        await idx.build(false);
        if (idx.size === 0) { printWarn('向量索引為空，請先執行 wiki vector build'); return; }
        const results = await idx.search(q, topK);
        results.forEach((r: any, i: number) => {
          const sim = (r.similarity * 100).toFixed(1);
          console.log(`\n  ${color.cyan(`[${i+1}]`)} ${color.bold(r.entry.title)}  ${color.dim('相似度 '+sim+'%')}`);
          console.log(`       ${color.dim(r.entry.path)}`);
          if (r.entry.excerpt) console.log(`       ${r.entry.excerpt.slice(0,80)}`);
        });
        console.log();
      } catch(e:any) { printError('搜尋失敗：'+e.message); }
      break;
    }

    case 'status': {
      printBanner('向量索引 — 狀態');
      if (fss.existsSync(VECTOR_CACHE)) {
        const cache = JSON.parse(fss.readFileSync(VECTOR_CACHE,'utf-8'));
        printOk(`快取存在：${VECTOR_CACHE}`);
        printInfo(`建立時間：${cache.built ?? '未知'}`);
        printInfo(`條目數量：${(cache.entries ?? []).length}`);
      } else {
        printWarn(`快取不存在（${VECTOR_CACHE}）`);
        printInfo('請執行 wiki vector build 建立索引');
      }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：build | search | status');
  }
}
