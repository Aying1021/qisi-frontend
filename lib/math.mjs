export function makeVariant(random = Math.random) {
  const r1 = Math.floor(random() * 9) - 4;
  const r2 = Math.floor(random() * 9) - 4;
  const b = -(r1 + r2), c = r1 * r2;
  const term = (n, suffix) => n === 0 ? '' : `${n > 0 ? ' + ' : ' − '}${Math.abs(n) === 1 && suffix ? '' : Math.abs(n)}${suffix}`;
  return { question: `x²${term(b, 'x')}${term(c, '')} = 0`, roots: [r1, r2] };
}
export function numberValue(value) {
  const normalized = String(value).trim().replaceAll('−', '-');
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number(normalized);
  if (/^[+-]?\d+\s*\/\s*[+-]?\d+$/.test(normalized)) {
    const [a, b] = normalized.split('/').map(Number);
    if (b !== 0) return a / b;
  }
  return NaN;
}
export function checkRoots(roots, answers) {
  const a = answers.map(numberValue).sort((x, y) => x - y);
  const b = [...roots].sort((x, y) => x - y);
  return a.length === 2 && a.every((x, i) => Number.isFinite(x) && Math.abs(x - b[i]) < 1e-8);
}
