/**
 * Regression tests for the Jev control-surface selection layer
 * Covers System One request shape, strict answer validation, membership projection, ordering, and the two-candidate floor
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTelegramButtonActionStore, handleTelegramButtonCallbackQuery, planTelegramButtonReply } from "../lib/outbound-buttons.ts";
import {
  buildSystemOneBody,
  projectSurface,
  renderTelegramSurface,
  type SystemOneAnswer,
} from '../lib/jev-surface.ts';

const candidates = [
  { id: 'a', label: '🔍 看细节', prompt: '展开细节' },
  { id: 'b', label: '♻️ 重跑', prompt: '重跑这一步' },
  { id: 'c', label: '🗑 删除', prompt: '删除产物' },
];

const answer = (choice: "keep" | "drop", keep: number): SystemOneAnswer => ({
  type: 'choice',
  choice,
  confidence: Math.max(keep, 1 - keep),
  probabilities: { keep, drop: 1 - keep },
});

test('建题：每题一个 choice，criteria 的值是对象', () => {
  const body = buildSystemOneBody({ task: 'x' }, candidates);
  assert.equal(body.model, 'typesafe/jev');
  const q = body.questions.keep_a;
  assert.equal(q.type, 'choice');
  assert.equal(typeof q.criteria.keep, 'object');
  assert.equal(q.criteria.keep.prompt, '展开细节');
});

test('投影：只收 Jev 选 keep 的，并按收的概率排序', () => {
  const s = projectSurface(
    { keep_a: answer('keep', 0.6), keep_b: answer('keep', 0.9), keep_c: answer('drop', 0.1) },
    candidates,
  );
  assert.deepEqual(s.rows.flat().map((b) => b.label), ['♻️ 重跑', '🔍 看细节']);
  assert.deepEqual(s.dropped, ['c']);
});

test('保底：全被 drop 时仍给两个最高分（控制面不能没有按钮）', () => {
  const s = projectSurface(
    { keep_a: answer('drop', 0.4), keep_b: answer('drop', 0.3), keep_c: answer('drop', 0.1) },
    candidates,
  );
  assert.equal(s.rows.flat().length, 2);
  assert.deepEqual(s.rows.flat().map((b) => b.label), ['🔍 看细节', '♻️ 重跑']);
});

test('封顶：最多 maxRows 个', () => {
  const s = projectSurface(
    { keep_a: answer('keep', 0.9), keep_b: answer('keep', 0.8), keep_c: answer('keep', 0.7) },
    candidates,
    2,
  );
  assert.equal(s.rows.flat().length, 2);
});

test('分排：同 row 的合成一行', () => {
  const withRow = [
    { id: 'a', label: '🔍 A', prompt: 'a', row: 'r1' },
    { id: 'b', label: '♻️ B', prompt: 'b', row: 'r1' },
    { id: 'c', label: '🗑 C', prompt: 'c' },
  ];
  const s = projectSurface(
    { keep_a: answer('keep', 0.9), keep_b: answer('keep', 0.85), keep_c: answer('drop', 0.2) },
    withRow,
  );
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].length, 2);
});

test('渲染：每行一个注释，标签带 emoji + 空格，提示进矩阵原子', () => {
  const markup = renderTelegramSurface([
    [
      { label: '🔍 看细节', prompt: '展开这一步的细节' },
      { label: '♻️ 重跑', prompt: '重跑这一步' },
    ],
    [{ label: '✅ 就这么办', prompt: '按这个方案继续' }],
  ]);
  assert.equal(
    markup,
    '<!-- telegram_button [{🔍 看细节|展开这一步的细节}{♻️ 重跑|重跑这一步}] -->\n<!-- telegram_button [{✅ 就这么办|按这个方案继续}] -->',
  );
});

test('渲染也是失败即失败：标签缺 emoji / 提示含 | 或 {} / 空行 / 超过四个都要抛', () => {
  assert.throws(() => renderTelegramSurface([[{ label: '看细节', prompt: 'x' }]]), /emoji/);
  assert.throws(() => renderTelegramSurface([[{ label: '🔍 看细节', prompt: '含 | 竖线' }]]), /矩阵/);
  assert.throws(() => renderTelegramSurface([[{ label: '🔍 看细节', prompt: '含 {大括号}' }]]), /矩阵/);
  assert.throws(() => renderTelegramSurface([[{ label: '🔍 看细节', prompt: '  ' }]]), /空/);
  assert.throws(() => renderTelegramSurface([]), /空面/);
  assert.throws(
    () => renderTelegramSurface([[1, 2, 3, 4, 5].map((n) => ({ label: `🔍 ${n}`, prompt: `p${n}` }))]),
    /最多 4/,
  );
});

test('失败即失败：概率不归一 / choice 与 argmax 不符 / 缺题 都要抛', () => {
  assert.throws(() => projectSurface({ keep_a: { type: 'choice', choice: 'keep', confidence: 0.6, probabilities: { keep: 0.6, drop: 0.6 } }, keep_b: answer('keep', 0.9), keep_c: answer('drop', 0.1) }, candidates), /归一/);
  assert.throws(() => projectSurface({ keep_a: { type: 'choice', choice: 'keep', confidence: 0.4, probabilities: { keep: 0.4, drop: 0.6 } }, keep_b: answer('keep', 0.9), keep_c: answer('drop', 0.1) }, candidates), /不一致/);
  assert.throws(() => projectSurface({ keep_b: answer('keep', 0.9), keep_c: answer('drop', 0.1) }, candidates), /非法/);
});

test("渲染输出能被传送端真实解析：标签进键盘、提示进动作存储，且不走绑定动作", async () => {
  const rows = [
    [{ label: "🔍 看细节", prompt: "展开这一步的细节" }],
    [
      { label: "♻️ 重跑", prompt: "重跑这一步" },
      { label: "✅ 就这么办", prompt: "按这个方案继续" },
    ],
  ];
  const store = createTelegramButtonActionStore();
  const plan = planTelegramButtonReply(renderTelegramSurface(rows), { registerAction: store.register });
  // The comment form feeds the classic keyboard, which places one button per row; matrix rows shape the in-body rich form.
  assert.deepEqual(
    plan.replyMarkup?.inline_keyboard.map((row) => row[0]?.text),
    rows.flat().map((button) => button.label),
  );
  const data = plan.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data;
  assert.ok(data, "渲染出的按钮必须带 callback data");
  let queued: string | undefined;
  await handleTelegramButtonCallbackQuery(
    { id: "callback", data, message: { chat: { id: 7 }, message_id: 8 } },
    undefined,
    {
      resolveAction: store.resolve,
      answerCallbackQuery: async () => {},
      enqueueButtonPrompt: (_query, action) => {
        queued = action.prompt;
      },
    },
  );
  assert.equal(queued, "展开这一步的细节");
});
