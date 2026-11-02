import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeVariant, checkRoots, numberValue } from '../lib/math.mjs';
import { completion } from '../lib/ai.mjs';

test('变式题的根与系数吻合，零项、负根和重根均可校验', () => {
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    let call = 0;
    const v = makeVariant(() => ((call++ === 0 ? i : j) + 0.1) / 9);
    assert.deepEqual(v.roots, [i - 4, j - 4]);
    assert(checkRoots(v.roots, [String(j - 4), String(i - 4)]));
    assert(!checkRoots(v.roots, [String(j - 3), String(i - 4)]));
    assert(!/\+\s*−|NaN|undefined/.test(v.question));
  }
  assert.equal(makeVariant(() => 0.5).question, 'x² = 0');
});
test('根输入支持分数、负数和零，同时拒绝空值及表达式执行', () => {
  assert.equal(numberValue('-3/2'), -1.5);
  assert.equal(numberValue('−2'), -2);
  for (const input of ['', ' ', 'Infinity', '0/0', '1/0', '1+1', 'process.exit()']) assert(Number.isNaN(numberValue(input)));
  assert(!checkRoots([0, 0], ['', '']));
  assert(!checkRoots([1, 1], ['1', '2']));
});
test('模型错误不会将上游请求或密钥回显，截断回复不被接受', async () => {
  const before = process.env.DASHSCOPE_API_KEY; process.env.DASHSCOPE_API_KEY = 'test-only';
  try {
    await assert.rejects(completion([], { fetcher: async () => ({ ok: false, status: 401 }) }), /密钥无效/);
    await assert.rejects(completion([], { fetcher: async () => { throw new Error('test-only'); } }), /暂时无法连接/);
    await assert.rejects(completion([], { fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }) }) }), /回复不完整/);
    const result = await completion([], { json: true, fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"reply":"ok"}' } }] }) }) });
    assert.equal(result.reply, 'ok');
  } finally { if (before === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = before; }
});
