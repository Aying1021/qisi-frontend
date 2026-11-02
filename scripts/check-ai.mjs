import { loadEnvFile } from 'node:process';
loadEnvFile();
try {
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
    body: JSON.stringify({ model: process.env.AI_MODEL, enable_thinking: false, max_tokens: 30, messages: [{ role: 'user', content: '请只回复：连接成功' }] }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, connected: response.ok && Boolean(data.choices?.[0]?.message?.content), message: response.ok ? data.choices?.[0]?.message?.content : data.error?.code }));
  if (!response.ok || !data.choices?.[0]?.message?.content) process.exitCode = 1;
} catch (error) { console.log(JSON.stringify({ connected: false, error: error.name, cause: error.cause?.code })); process.exitCode = 1; }
