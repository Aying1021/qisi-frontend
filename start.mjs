import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 配置无效，请使用 1 到 65535 的整数。');
  process.exitCode = 1;
} else {
  const address = `http://127.0.0.1:${port}`;
  let running = false;
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(2000) });
    running = response.ok && (await response.text()).includes('<title>启思 · 数学学习教练</title>');
  } catch { /* 没有运行中的项目，正常启动。 */ }
  if (running) {
    console.log(`启思已经在运行，无需重复启动。\n请在浏览器中打开：${address}\n这个新窗口可以关闭，请保留原来的服务窗口。`);
  } else {
    console.log(`请在浏览器中打开：${address}\n使用时保持此窗口开启，按 Ctrl+C 停止服务。`);
    await import('./server.mjs');
  }
}
