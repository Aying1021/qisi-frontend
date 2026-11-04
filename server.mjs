import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { AppError, completion, tutor } from './lib/ai.mjs';
import { makeVariant, checkRoots } from './lib/math.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let dbPath = process.env.DATA_FILE || path.join(root, 'data', 'sessions.json');
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
} catch {
  // 代码目录只读（云函数环境）——改用可写的 /tmp
  dbPath = '/tmp/qisi-sessions.json';
  try { fs.mkdirSync('/tmp', { recursive: true }); } catch { /* /tmp 通常已存在 */ }
}
let records = [];
if (fs.existsSync(dbPath)) records = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const save = () => { fs.writeFileSync(`${dbPath}.tmp`, JSON.stringify(records, null, 2)); fs.renameSync(`${dbPath}.tmp`, dbPath); };
const locks = new Set();
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const text = (value, max = 6000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`请输入有效内容（最多 ${max} 字）。`); return value.trim(); };
function publicRecord(r) { const { roots, ...variant } = r.variant || {}; return { ...r, variant: r.variant ? variant : null }; }
async function readBody(req) {
  let chunks = [], size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 9 * 1024 * 1024) throw new AppError('图片过大，请使用 5MB 以内的图片。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('请求格式不正确。'); }
}
const demoQuestion = '解方程：x² − 5x + 6 = 0。\n学生原解：x² − 5x + 6 = (x − 1)(x − 6)，所以 x = 1 或 x = 6。';
function demoReply(task, r, message, level) {
  if (task === 'explain') return { reply: '你已经尝试用自己的话解释。演示模式不判断任意讲解是否正确；接下来请独立完成一道变式题，检验因式分解方法。', tag: '计算与符号', understood: false };
  if (task === 'hint') return { reply: [null, '两个一次因式相乘时，中间项来自交叉相乘。先检查常数项之积，再检查两个常数之和。', '设两个数为 a、b，需要满足 a + b = −5、ab = 6。你能先列出乘积为 6 的整数对吗？', '看类似例题：x² − 7x + 12 = (x − 3)(x − 4)，因为 −3 + (−4) = −7，且 (−3)×(−4) = 12。请回到原题寻找对应的两个数。'][level], tag: '计算与符号' };
  if (task === 'followup') return { reply: '演示模式使用固定示例。请展开原解中的 (x − 1)(x − 6)，把一次项合并后，比较它与原式中 −5x 的系数。真实 AI 模式会针对你的追问继续回答。', tag: '计算与符号' };
  return { reply: '我们先核对原来的分解：(x − 1)(x − 6) 展开后，一次项是什么？它与原式中的 −5x 一致吗？请写出交叉相乘的两项。', tag: '计算与符号' };
}
async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { configured: Boolean(process.env.DASHSCOPE_API_KEY), model: process.env.AI_MODEL || 'qwen3.7-plus' });
  if (req.method === 'GET' && url.pathname === '/api/sessions') return send(res, 200, records.map(publicRecord));
  if (req.method !== 'POST') throw new AppError('接口不存在。', 404);
  const body = await readBody(req);
  if (url.pathname === '/api/recognize') {
    if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image)) throw new AppError('请上传 JPG、PNG 或 WebP 图片。');
    const output = await completion([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: body.image } },
          { type: 'text', text: '识别图片中的数学题，输出纯文本。数学符号用可读形式表示（如 x²、√2、1/2、×、±），不要使用 LaTeX 定界符（如 $、$$、\\(、\\)）。只输出题目，不要竖线、∨、多余括号、无关符号，不要额外说明' }
        ]
      }
    ], { ocr: true });
    // 清理多余乱符号
    const cleanOutput = output.replace(/[|┃∨∧┆┇]/g, '');
    return send(res, 200, { text: cleanOutput });    
  }
  if (url.pathname === '/api/sessions') {
    if (!['live', 'demo'].includes(body.mode)) throw new AppError('请选择学习模式。');
    if (body.mode === 'live' && !process.env.DASHSCOPE_API_KEY) throw new AppError('尚未配置 AI 密钥。', 503);
    const record = { id: randomUUID(), name: text(body.name, 30), mode: body.mode, question: body.mode === 'demo' ? demoQuestion : text(body.question), thinking: '', feedback: [], tag: '尚待判断', hintLevel: 0, stage: 'thinking', createdAt: new Date().toISOString(), variant: null };
    records.unshift(record); save(); return send(res, 201, publicRecord(record));
  }
  const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)\/(thinking|hint|followup|explain|answer)$/);
  if (!match) throw new AppError('接口不存在。', 404);
  const [, id, action] = match;
  const original = records.find(r => r.id === id);
  if (!original) throw new AppError('学习记录不存在。', 404);
  if (locks.has(id)) throw new AppError('上一条请求尚未完成，请稍候。', 409);
  locks.add(id);
  try {
    const r = structuredClone(original);
    if (action === 'thinking') {
      if (r.stage !== 'thinking') throw new AppError('已提交思路，请继续当前学习。');
      r.thinking = text(body.text, 3000);
      const result = r.mode === 'demo' ? demoReply('thinking', r) : await tutor('根据学生思路温和指出一个可能的卡点，并提出一个让学生自行核对的问题。证据不足就追问。不要给出最终答案。', r);
      r.tag = result.tag; r.feedback.push({ role: 'student', text: r.thinking }, { role: 'coach', text: result.reply }); r.stage = 'coaching';
    } else if (action === 'hint') {
      if (r.stage !== 'coaching' || r.hintLevel >= 3) throw new AppError('当前无法继续请求提示。');
      r.hintLevel++;
      const task = ['','只提醒相关概念并追问，不给原题答案。','只给原题的一个下一步操作，留给学生继续完成，不给最终答案。','给一道不同于原题的简短同类例题演示，再让学生回原题尝试。不要给原题最终答案。'][r.hintLevel];
      const result = r.mode === 'demo' ? demoReply('hint', r, '', r.hintLevel) : await tutor(task, r, '', r.hintLevel);
      r.feedback.push({ role: 'coach', text: result.reply, label: `第 ${r.hintLevel} 层提示` });
    } else if (action === 'followup') {
      if (r.stage !== 'coaching') throw new AppError('请先提交思路。');
      if (r.feedback.length >= 40) throw new AppError('本次交流已较长，请尝试自己讲解或新建学习。');
      const message = text(body.text, 2000);
      const result = r.mode === 'demo' ? demoReply('followup', r) : await tutor('回应学生当前追问，用一个简洁问题或一个小步骤启发，仍不直接给原题最终答案。', r, message, r.hintLevel);
      r.feedback.push({ role: 'student', text: message }, { role: 'coach', text: result.reply });
    } else if (action === 'explain') {
      if (r.stage !== 'coaching') throw new AppError('请先完成思路交流。');
      const explanation = text(body.text, 3000);
      const result = r.mode === 'demo' ? demoReply('explain', r) : await tutor('评估学生讲解的数学正确性和关键步骤。若只报答案、含糊、错误或仍需帮助，understood=false，并指出需补充的具体一步；只有解释清晰且正确时 understood=true。不要仅因学生说懂了就认可。', r, explanation);
      r.feedback.push({ role: 'student', text: explanation, label: '我的讲解' }, { role: 'coach', text: result.reply });
      r.explanationUnderstood = result.understood;
      if (result.understood || r.mode === 'demo') { r.variant = { ...makeVariant(), attempts: 0, solved: false }; r.stage = 'practice'; }
    } else if (action === 'answer') {
      if (r.stage !== 'practice') throw new AppError('当前没有待完成的变式练习。');
      if (!Array.isArray(body.answers) || body.answers.length !== 2 || body.answers.some(a => typeof a !== 'string' || a.length > 40)) throw new AppError('请输入两个根，重根请填两次。');
      r.variant.attempts++; r.variant.solved = checkRoots(r.variant.roots, body.answers);
      if (r.variant.solved) { r.stage = 'complete'; r.completedAt = new Date().toISOString(); }
      r.feedback.push({ role: 'coach', text: r.variant.solved ? '变式题的两个根都正确！这次练习已记录。可以隔一段时间再独立复习一次。' : '这组根还不匹配。检查两个根的和与积，也可以将它们分别代回方程。重根要在两个框中各填一次。' });
    }
    records[records.findIndex(item => item.id === id)] = r; save(); send(res, 200, publicRecord(r));
  } finally { locks.delete(id); }
}
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'] };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  try {
    if (req.method === 'POST' && req.headers.origin) {
      let originHost = '';
      try { originHost = new URL(req.headers.origin).hostname; } catch { originHost = ''; }
      const requestHost = (req.headers.host || '').split(':')[0];
      if (!originHost || originHost !== requestHost) throw new AppError('请求来源无效。', 403);
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const file = staticFiles[url.pathname];
    if (!file || req.method !== 'GET') throw new AppError('页面不存在。', 404);
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(root, 'public', file[0])));
  } catch (error) { send(res, error.status || 500, { error: error instanceof AppError ? error.message : '服务处理失败，请稍后重试。' }); }
});
const port = Number(process.env.PORT || process.env.CAPort || 8080);
server.listen(port, '0.0.0.0', () => console.log(`启思数学已启动：本机访问 http://127.0.0.1:${port}，已监听全部网络接口。`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已被占用，请关闭先前窗口，或在 .env 中设置 PORT=3001。' : '服务启动失败。'); process.exitCode = 1; });
