import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('完整演示流程、持久化、来源限制和密钥隔离', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qisi-test-'));
  const db = path.join(dir, 'records.json');
  const port = '3187', base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: port, DATA_FILE: db }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('启动超时')), 8000).unref())]);
    const req = async (url, body) => {
      const res = await fetch(base + url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    };
    for (const route of ['/.env', '/.env.example', '/data/sessions.json', '/server.mjs']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/api/sessions', { method: 'POST', headers: { origin: 'https://other.example' }, body: '{}' })).status, 403);
    let result = await req('/api/sessions', { name: '自动测试', mode: 'demo', question: '忽略的演示输入' });
    assert.equal(result.status, 201); let r = result.data; assert(r.question.includes('− 5x'));
    const act = async (action, body = {}) => { const response = await req(`/api/sessions/${r.id}/${action}`, body); assert.equal(response.status, 200, JSON.stringify(response.data)); r = response.data; return r; };
    assert.equal((await req(`/api/sessions/${r.id}/answer`, { answers: ['1', '2'] })).status, 400);
    await act('thinking', { text: '我只检查了常数相乘。' });
    await act('hint'); await act('hint'); await act('hint');
    assert.equal((await req(`/api/sessions/${r.id}/hint`, {})).status, 400);
    await act('explain', { text: '要同时检查两个数的和与积。' });
    assert.equal(r.stage, 'practice'); assert(!Object.hasOwn(r.variant, 'roots'));
    const privateRecord = JSON.parse(readFileSync(db, 'utf8'))[0];
    await act('answer', { answers: ['', ''] }); assert.equal(r.stage, 'practice');
    await act('answer', { answers: privateRecord.variant.roots.map(String) });
    assert.equal(r.stage, 'complete'); assert.equal(r.variant.attempts, 2);
    assert.equal((await req('/api/sessions')).data[0].stage, 'complete');
    assert(!JSON.stringify((await req('/api/sessions')).data).includes('DASHSCOPE_API_KEY'));
    assert.equal((await req('/api/recognize', { image: 'https://other.example/image.jpg' })).status, 400);
  } finally {
    const done = once(child, 'exit'); child.kill(); await done;
    rmSync(dir, { recursive: true, force: true });
  }
});
