// Micro-benchmark for the message rendering path (not part of the test suite).
import { performance } from 'node:perf_hooks';
import { renderTelegramMessage } from '../lib/rendering.ts';

const para = '这是**一段**带 `code` 和 [链接](https://example.com) 的普通文字，长度大概这么多。';
const blocks = [];
for (let i = 0; i < 400; i++) {
  blocks.push(para);
  if (i % 7 === 0) blocks.push('## 标题 ' + i);
  if (i % 11 === 0) blocks.push('```ts\nconst x' + i + ' = ' + i + ';\n```');
  if (i % 13 === 0) blocks.push('- 列表项 ' + i);
}
const big = blocks.join('\n\n');

function time(label, fn, iters = 5) {
  fn();
  const runs = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  console.log(label.padEnd(38), runs[Math.floor(runs.length / 2)].toFixed(1) + ' ms');
}

console.log('input chars:', big.length.toLocaleString());
time('markdown → html chunks', () => renderTelegramMessage(big, { mode: 'markdown' }));
time('plain chunks', () => renderTelegramMessage(big, { mode: 'plain' }));

// streaming: the bridge re-renders as tokens arrive, roughly every 40 chars
const step = 40;
time('markdown, 1 token-step re-render', () => {
  for (let n = step; n < big.length; n += big.length / 40) {
    renderTelegramMessage(big.slice(0, Math.floor(n)), { mode: 'markdown' });
  }
});
