import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '3189', DATA_FILE: path.resolve('.qa/browser-records.json') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser, ws, call;
try {
  await once(server.stdout, 'data');
  browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9227', `--user-data-dir=${path.resolve('.qa/edge-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40; i++) { try { const items = await (await fetch('http://127.0.0.1:9227/json/list')).json(); target = items.find(t => t.type === 'page'); if (target) break; } catch {} await wait(250); }
  assert(target, '未发现浏览器调试页面');
  ws = new WebSocket(target.webSocketDebuggerUrl); await once(ws, 'open');
  const pending = new Map(); let next = 1;
  ws.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id && pending.has(data.id)) { const { resolve, reject, timer } = pending.get(data.id); clearTimeout(timer); pending.delete(data.id); data.error ? reject(new Error(data.error.message)) : resolve(data.result); } });
  call = (method, params = {}) => new Promise((resolve, reject) => { const id = next++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`浏览器操作超时：${method}`)); }, 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; };
  const until = async expression => { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await wait(150); } throw new Error('页面条件未满足：' + expression); };
  const screenshot = async filename => { const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(path.resolve('.qa', filename), Buffer.from(result.data, 'base64')); };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:3189' });
  await until('document.querySelector("#connection")?.textContent.includes("密钥已配置")');
  await screenshot('desktop.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate('document.querySelector("#demo-mode").click();document.querySelector("#student-name").value="浏览器验证";document.querySelector("#question-form").requestSubmit()');
  await until('!document.querySelector("#thinking-form").hidden && document.querySelector("#busy").hidden');
  await evaluate('document.querySelector("#thinking").value="我只核对了常数项相乘";document.querySelector("#thinking-form").requestSubmit()');
  await until('!document.querySelector("#coaching-actions").hidden && document.querySelector("#busy").hidden');
  await evaluate('document.querySelector("#hint-button").click()');
  await until('document.querySelector("#hint-label").textContent.includes("1 / 3") && document.querySelector("#busy").hidden');
  await evaluate('document.querySelector("#explanation").value="因式分解要检查两个数的和与积";document.querySelector("#explain-form").requestSubmit()');
  await until('!document.querySelector("#practice-form").hidden && document.querySelector("#busy").hidden');
  await screenshot('practice.png');
  await evaluate('document.querySelector("[data-view=teacher]").click()');
  assert(await evaluate('document.querySelector("#stats").textContent.includes("示例演示记录")'));
  await screenshot('teacher.png');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector("[data-view=learn]").click();window.scrollTo(0,0)');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '手机页面不能横向溢出');
  await screenshot('mobile.png');
  console.log('浏览器：桌面、手机、上传入口、演示交流、提示、讲解、变式和教师看板通过。');
  await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 450, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'about:blank' }); await wait(400);
  await evaluate('document.body.innerHTML = ' + JSON.stringify('<main style="padding:45px;font:28px Arial;line-height:2">解方程：x² − 5x + 6 = 0<br>学生原解：(x − 1)(x − 6) = 0<br>所以 x = 1 或 x = 6</main>'));
  const image = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.resolve('.qa/ocr-question.png'), Buffer.from(image.data, 'base64'));
  const res = await fetch('http://127.0.0.1:3189/api/recognize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/png;base64,' + image.data }), signal: AbortSignal.timeout(70000) });
  const data = await res.json(); assert(res.ok, data.error); assert(data.text.includes('5') && data.text.includes('6') && /x/i.test(data.text));
  console.log('真实图片识别：通过（包含题目及学生原解）。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (call) { try { await call('Browser.close'); } catch {} }
  if (ws) ws.close();
  if (browser) browser.kill();
  const done = once(server, 'exit'); server.kill(); await done;
}
