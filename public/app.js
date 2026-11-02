const $ = id => document.getElementById(id);
const state = { mode: 'live', current: null, records: [], view: 'learn', busy: false };
const example = '解方程：x² − 5x + 6 = 0。\n学生原解：x² − 5x + 6 = (x − 1)(x − 6)，所以 x = 1 或 x = 6。';
const stages = { thinking: '等待思路', coaching: '探索与讲解', practice: '变式练习', complete: '已完成' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderText(el, raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n');
  const store = [];
  const keep = (math, display) => { store.push([math, display]); return `\uE000${store.length - 1}\uE001`; };
  let out = text
    .replace(/```(?:latex|math|tex)\s*([\s\S]*?)```/gi, (_, m) => keep(m.trim(), true))
    .replace(/```[a-z]*\s*([\s\S]*?)```/gi, '$1')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => keep(m, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => keep(m, true))
    .replace(/\$([^$\n]+?)\$/g, (_, m) => keep(m, false))
    .replace(/\\\((.+?)\\\)/g, (_, m) => keep(m, false))
    .replace(/^[^\u4e00-\u9fff$\uE000\uE001]*(?:\\[a-zA-Z]+|[\^_])[^\u4e00-\u9fff$\uE000\uE001]*$/gm, m => keep(m.trim(), true))
    .replace(/\\(?:frac\{[^{}]*\}\{[^{}]*\}|sqrt\{[^{}]*\}|text\{[^{}]*\}|mathrm\{[^{}]*\}|vec\{[^{}]*\}|hat\{[^{}]*\}|overline\{[^{}]*\}|Delta|pm|mp|times|cdot|div|leq|geq|neq|le|ge|ne|approx|equiv|infty|pi|theta|alpha|beta|gamma|delta|angle|perp|parallel|forall|exists)(?![a-zA-Z])/g, m => keep(m, false))
    .replace(/([a-zA-Z0-9)\]](?:\^[0-9a-zA-Z]{1,3}|_[0-9a-zA-Z]{1,3}))(?![0-9a-zA-Z])/g, m => keep(m, false));
  out = escape(out);
  if (window.marked) { try { if (marked.setOptions) marked.setOptions({ breaks: true, gfm: true }); out = marked.parse(out); } catch { out = out.replace(/\n/g, '<br>'); } }
  else out = out.replace(/\n/g, '<br>');
  out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => { const [math, display] = store[Number(i)] || ['', false]; const d = display ? '$$' : '$'; return `${d}${math}${d}`; });
  el.innerHTML = out;
  if (window.renderMathInElement) { try { renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch { /* 公式渲染失败时保留原文。 */ } }
}
function cleanOCR(raw) {
  let t = String(raw ?? '');
  t = t.replace(/```(?:latex|math|tex)?\s*([\s\S]*?)```/gi, '$1');
  t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, '');
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  t = t.replace(/\$([^$\n]+?)\$/g, '$1');
  t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => {
    const na = /[+\-×·\/]/.test(a) ? `(${a})` : a;
    const nb = /[+\-×·\/]/.test(b) ? `(${b})` : b;
    return `${na}/${nb}`;
  });
  t = t.replace(/\\sqrt\{([^{}]*)\}/g, (_, m) => /[+\-×·\/]/.test(m) ? `√(${m})` : `√${m}`);
  const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','x':'ˣ','y':'ʸ','z':'ᶻ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ' };
  t = t.replace(/\^\{?([0-9a-zA-Z+\-=\(\)]+)\}?/g, (_, m) => m.split('').map(c => sup[c] || c).join(''));
  const sub = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','a':'ₐ','e':'ₑ','i':'ᵢ','o':'ₒ','u':'ᵤ','v':'ᵥ','x':'ₓ','y':'ᵧ','j':'ⱼ','n':'ₙ','r':'ᵣ','s':'ₛ','t':'ₜ','k':'ₖ','l':'ₗ','m':'ₘ','p':'ₚ','h':'ₕ' };
  t = t.replace(/_\{?([0-9a-zA-Z]+)\}?/g, (_, m) => m.split('').map(c => sub[c] || c).join(''));
  const cmds = { '\\times':'×','\\cdot':'·','\\pm':'±','\\mp':'∓','\\div':'÷','\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈','\\equiv':'≡','\\infty':'∞','\\pi':'π','\\theta':'θ','\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\Delta':'Δ','\\angle':'∠','\\perp':'⊥','\\parallel':'∥','\\forall':'∀','\\exists':'∃','\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃','\\cup':'∪','\\cap':'∩','\\emptyset':'∅','\\varnothing':'∅','\\dots':'…','\\cdots':'⋯','\\vdots':'⋮','\\ldots':'…' };
  for (const [k, v] of Object.entries(cmds)) t = t.split(k).join(v);
  t = t.replace(/\\(?:text|mathrm|mathbb|mathbf|textbf|textit|underline|overline|vec|hat|bar|dot|ddot)\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\left/g, '').replace(/\\right/g, '').replace(/\\begin\{[a-zA-Z]*\*?\}/g, '').replace(/\\end\{[a-zA-Z]*\*?\}/g, '');
  t = t.replace(/\\[,;:!]/g, ' ').replace(/\\quad/g, '  ').replace(/\\qquad/g, '    ');
  t = t.replace(/\\\\/g, '\n');
  t = t.replace(/\\[a-zA-Z]+(?![a-zA-Z])/g, '');
  t = t.replace(/\\(?![a-zA-Z])/g, '');
  t = t.replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 7000); }
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求未完成，请重试。');
  return data;
}
async function run(label, fn) {
  if (state.busy) return;
  state.busy = true; $('busy').hidden = false; $('busy-text').textContent = label;
  const controls = [...document.querySelectorAll('button,input,textarea')].map(el => [el, el.disabled]);
  controls.forEach(([el]) => el.disabled = true);
  try { await fn(); } catch (error) { toast(error.message || '处理失败，请重试。'); }
  finally { controls.forEach(([el, wasDisabled]) => el.disabled = wasDisabled); state.busy = false; $('busy').hidden = true; renderSession(); }
}
function setMode(mode) {
  state.mode = mode;
  $('live-mode').classList.toggle('selected', mode === 'live'); $('demo-mode').classList.toggle('selected', mode === 'demo');
  $('live-mode').setAttribute('aria-pressed', String(mode === 'live')); $('demo-mode').setAttribute('aria-pressed', String(mode === 'demo'));
  $('mode-note').textContent = mode === 'demo' ? '固定示例流程，不调用 AI；诊断与提示为预设内容。' : '由通义千问提供辅导；调用会使用你的模型额度。';
  $('question').readOnly = mode === 'demo'; $('image-file').disabled = mode === 'demo';
  if (mode === 'demo') $('question').value = example;
}
function showView(view) {
  state.view = view;
  for (const name of ['learn', 'history', 'teacher']) $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('breadcrumb').textContent = `学习空间 / ${{ learn: '学习工作台', history: '错题与记录', teacher: '教师学情' }[view]}`;
  if (view === 'history') renderHistory();
  if (view === 'teacher') renderTeacher();
}
function updateRecord(record) {
  state.current = record;
  state.records = [record, ...state.records.filter(r => r.id !== record.id)];
  state.records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try { localStorage.setItem('qisi-current', record.id); } catch { /* 本地存储不可用不影响学习。 */ }
  renderSession();
}
function renderSession() {
  const r = state.current;
  $('empty-coach').hidden = Boolean(r); $('active-coach').hidden = !r;
  $('start-button').innerHTML = r ? '新建另一道题 <span>→</span>' : '开始探索 <span>→</span>';
  const activeStep = !r ? 0 : r.stage === 'thinking' ? 1 : r.stage === 'coaching' ? 2 : 3;
  document.querySelectorAll('[data-step]').forEach(el => { el.classList.toggle('current', Number(el.dataset.step) === activeStep); el.classList.toggle('done', Number(el.dataset.step) < activeStep); });
  if (!r) return;
  $('session-mode').textContent = r.mode === 'demo' ? '示例演示 · 预设反馈' : '真实 AI 辅导';
  $('session-tag').textContent = `可能卡点：${r.tag}`;
  renderText($('session-question'), r.question);
  $('messages').replaceChildren();
  if (!r.feedback.length) {
    const p = document.createElement('div'); p.className = 'message'; p.textContent = '先不着急改答案。你当时是怎么想的？把自己的思路写下来，我们从这里开始。'; $('messages').append(p);
  }
  for (const item of r.feedback) {
    const bubble = document.createElement('div'); bubble.className = `message ${item.role === 'student' ? 'student' : 'coach'}`;
    const name = document.createElement('small'); name.textContent = item.label || (item.role === 'student' ? '我的思考' : '启思教练');
    const content = document.createElement('div'); renderText(content, item.text); bubble.append(name, content); $('messages').append(bubble);
  }
  $('messages').scrollTop = $('messages').scrollHeight;
  $('thinking-form').hidden = r.stage !== 'thinking'; $('coaching-actions').hidden = r.stage !== 'coaching';
  $('practice-form').hidden = r.stage !== 'practice'; $('complete-box').hidden = r.stage !== 'complete';
  $('hint-label').textContent = `已使用 ${r.hintLevel} / 3 层提示`;
  $('hint-button').textContent = r.hintLevel >= 3 ? '试着自己讲一遍' : `获取第 ${r.hintLevel + 1} 层提示`;
  $('hint-button').disabled = state.busy || r.hintLevel >= 3;
  if (r.variant) renderText($('variant-question'), r.variant.question);
}
function reset() {
  state.current = null;
  try { localStorage.removeItem('qisi-current'); } catch { /* 可继续使用。 */ }
  for (const id of ['question', 'thinking', 'followup', 'explanation', 'root-one', 'root-two', 'image-file']) $(id).value = '';
  $('image-preview-wrap').hidden = true;
  setMode(state.mode); showView('learn'); renderSession(); $('question').focus();
}
function renderHistory() {
  const list = $('history-list');
  if (!state.records.length) { list.innerHTML = '<div class="card history-empty">还没有学习记录。从一道错题开始吧。</div>'; return; }
  list.innerHTML = state.records.map((r, i) => `<article class="card history-entry"><span class="entry-number">${String(i + 1).padStart(2, '0')}</span><div class="history-content"><span class="pill">${r.mode === 'demo' ? '示例演示' : '真实 AI'}</span><h3>${escape(r.question.slice(0, 85))}</h3><p>${escape(r.name)} · ${new Date(r.createdAt).toLocaleString('zh-CN')} · ${stages[r.stage]} · ${r.hintLevel} 次提示</p></div><button class="secondary" data-open="${r.id}">继续查看 →</button></article>`).join('');
}
function renderTeacher() {
  const real = state.records.filter(r => r.mode === 'live');
  const assessed = real.filter(r => r.stage !== 'thinking');
  const complete = real.filter(r => r.stage === 'complete');
  const demoCount = state.records.length - real.length;
  const stats = [['真实学习记录', real.length, `${new Set(real.map(r => r.name)).size} 个学习昵称（非身份认证）`], ['完成变式练习', complete.length, '按数学答案校验，不等同长期掌握'], ['平均提示次数', assessed.length ? (assessed.reduce((s, r) => s + r.hintLevel, 0) / assessed.length).toFixed(1) : '—', '仅计算已提交思路的真实记录'], ['示例演示记录', demoCount, '不计入真实学习与错因分布']];
  $('stats').innerHTML = stats.map(([label, value, note]) => `<div class="card stat"><small>${label}</small><strong>${value}</strong><p>${note}</p></div>`).join('');
  const tags = ['概念理解', '计算与符号', '解题方法', '审题', '尚待判断'];
  const counts = tags.map(tag => [tag, assessed.filter(r => r.tag === tag).length]);
  $('tag-chart').innerHTML = assessed.length ? counts.map(([tag, count]) => `<div class="bar-row"><div class="bar-label"><span>${tag}</span><span>${count} 次</span></div><div class="bar-track"><div class="bar-fill w${Math.ceil(count / assessed.length * 5)}"></div></div>`).join('') : '<p class="muted">完成一次真实 AI 思路交流后，这里会显示分布。</p>';
  const leading = [...counts].sort((a, b) => b[1] - a[1])[0];
  $('teacher-advice').innerHTML = !assessed.length ? '<div class="advice-item">等待真实学习记录<p>演示记录可以体验流程，真实记录才能形成这里的建议。</p></div>' : `<div class="advice-item">优先查看：${leading[0]}<p>当前有 ${leading[1]} 次记录涉及这一类卡点，可查看学生原始思路后决定是否安排短讲解。</p></div><div class="advice-item">${real.filter(r => r.stage !== 'complete').length} 次学习尚未完成<p>先确认是否只是暂时离开，再关注需要帮助的步骤。</p></div><div class="advice-item">安排延迟复习<p>已完成变式题的学习者，可隔几天再做一道同类题，观察是否能独立解释。</p></div>`;
  $('teacher-rows').innerHTML = state.records.length ? state.records.map(r => `<tr><td>${escape(r.name)}${r.mode === 'demo' ? ' · 演示' : ''}</td><td>${escape(r.tag)}</td><td>${r.hintLevel}</td><td>${stages[r.stage]}</td><td><button class="secondary" data-open="${r.id}">查看</button></td></tr>`).join('') : '<tr><td colspan="5">暂无记录</td></tr>';
}
async function action(actionName, data) {
  if (!state.current) return;
  updateRecord(await api(`/api/sessions/${state.current.id}/${actionName}`, data));
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); showView('learn'); });
$('live-mode').addEventListener('click', () => setMode('live'));
$('demo-mode').addEventListener('click', () => setMode('demo'));
$('example-button').addEventListener('click', () => $('question').value = example);
$('question-form').addEventListener('submit', e => { e.preventDefault(); run('正在创建学习记录…', async () => { updateRecord(await api('/api/sessions', { mode: state.mode, name: $('student-name').value, question: $('question').value })); for (const id of ['thinking','followup','explanation','root-one','root-two']) $(id).value = ''; toast('先说说你的思路，开始这次探索。'); if (innerWidth < 640) $('active-coach').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
$('thinking-form').addEventListener('submit', e => { e.preventDefault(); run('教练正在阅读你的思路…', async () => { await action('thinking', { text: $('thinking').value }); $('thinking').value = ''; }); });
$('hint-button').addEventListener('click', () => run('正在准备一小步提示…', () => action('hint', {})));
$('followup-form').addEventListener('submit', e => { e.preventDefault(); run('教练正在回应你的追问…', async () => { await action('followup', { text: $('followup').value }); $('followup').value = ''; }); });
$('explain-form').addEventListener('submit', e => { e.preventDefault(); run('正在检验你的讲解…', async () => { await action('explain', { text: $('explanation').value }); if (state.current.stage === 'practice') $('explanation').value = ''; }); });
$('practice-form').addEventListener('submit', e => { e.preventDefault(); run('正在核对两个根…', () => action('answer', { answers: [$('root-one').value, $('root-two').value] })); });
for (const id of ['new-session','history-new']) $(id).addEventListener('click', reset);
document.addEventListener('click', e => { const button = e.target.closest('[data-open]'); if (!button || state.busy) return; const record = state.records.find(r => r.id === button.dataset.open); if (record) { updateRecord(record); showView('learn'); if (innerWidth < 640) $('active-coach').scrollIntoView({ behavior: 'smooth' }); } });
$('image-file').addEventListener('change', () => {
  const file = $('image-file').files[0]; if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast('请选择 5MB 以内的 JPG、PNG 或 WebP 图片。'); $('image-file').value = ''; return; }
  run('正在识别题目，请稍候…', async () => {
    const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); });
    $('image-preview').src = image; $('image-preview-wrap').hidden = false;
    const result = await api('/api/recognize', { image }); $('question').value = cleanOCR(result.text); toast('识别完成，请先核对题目和公式，再开始探索。');
  });
});
$('export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: '本机学习记录，mode=demo 的记录为预设演示。', sessions: state.records }, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '启思学习记录.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function init() {
  setMode('live'); renderSession();
  try {
    const [status, records] = await Promise.all([api('/api/status'), api('/api/sessions')]); state.records = records;
    $('connection').textContent = status.configured ? `密钥已配置 · ${status.model}` : '密钥未配置 · 可使用演示';
    let id; try { id = localStorage.getItem('qisi-current'); } catch { /* 不恢复会话。 */ }
    const record = records.find(r => r.id === id); if (record) updateRecord(record);
  } catch (error) { $('connection').textContent = '服务连接异常'; toast(error.message); }
}
init();
