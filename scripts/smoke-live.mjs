import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa', { recursive: true });
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '3188', DATA_FILE: path.resolve('.qa/live-records.json') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('启动超时')), 8000).unref())]);
  const request = async (route, body) => { const res = await fetch('http://127.0.0.1:3188' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; };
  let r = await request('/api/sessions', { mode: 'live', name: '接口验证', question: '解方程 x²−5x+6=0。我分解成 (x−1)(x−6)。' });
  r = await request(`/api/sessions/${r.id}/thinking`, { text: '我找了两个乘积为6的数1和6，但没有检查中间项。' });
  assert.equal(r.stage, 'coaching'); console.log('真实错因诊断：通过；分类=' + r.tag);
  r = await request(`/api/sessions/${r.id}/hint`, {}); assert.equal(r.hintLevel, 1); console.log('真实分层提示：通过');
  r = await request(`/api/sessions/${r.id}/explain`, { text: '要找乘积是6、和是−5的两个数，即−2与−3。因为(x−2)(x−3)=x²−5x+6，所以由零乘积性质得 x=2或3。我之前的1和6对应的和是−7，不匹配。' });
  assert.equal(r.stage, 'practice'); console.log('真实讲解评估并生成可验证变式：通过');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { const done = once(child, 'exit'); child.kill(); await done; }
