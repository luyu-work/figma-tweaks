const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

const PRELUDE = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
`;

const page = ({ head = '', body = '', scripts = [] }) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}
<script>${PRELUDE}</script>
${scripts.map((s) => `<script>${s.replace(/<\/script/gi, '<\\/script')}</script>`).join('\n')}
</body></html>`;

let tls = null;
const certificate = () => {
  if (tls) return tls;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-tls-'));
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=figma.com'], { stdio: 'ignore', windowsHide: true });
  tls = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  fs.rmSync(dir, { recursive: true, force: true });
  return tls;
};

const serve = (html) => new Promise((resolve) => {
  const server = https.createServer(certificate(), (req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const fileUrl = (file) => 'file:///' + file.replace(/\\/g, '/');

function launch(flags) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-pipe', `--user-data-dir=${profile}`, ...flags,
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  const [to, from] = [child.stdio[3], child.stdio[4]];
  let nextId = 1, buffer = '';
  const pending = new Map(), listeners = [];
  from.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else listeners.forEach((l) => l(msg));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    to.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const close = async () => {
    child.kill();
    await new Promise((r) => child.once('close', r));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { send, on: (l) => listeners.push(l), close };
}

async function open(browser, url, viewport) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const loaded = new Promise((resolve) => browser.on((m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) resolve(); }));
  await browser.send('Page.enable', {}, sessionId);
  if (viewport) await browser.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile: false }, sessionId);
  await browser.send('Page.navigate', { url }, sessionId);
  await loaded;
  return sessionId;
}

async function evaluate(browser, sessionId, expression) {
  const r = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}

async function runPage(spec) {
  if (!CHROME) throw new Error('Chrome not found, set CHROME_PATH');
  const flags = [];
  if (spec.scale) flags.push(`--force-device-scale-factor=${spec.scale}`);
  let server = null, dir = null, url;
  if (spec.host) {
    server = await serve(page(spec));
    url = `https://${spec.host}:${server.address().port}${spec.path || '/'}`;
    flags.push(`--host-resolver-rules=MAP ${spec.host} 127.0.0.1`, '--ignore-certificate-errors');
  } else {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-page-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, page(spec));
    url = fileUrl(file);
    flags.push('--allow-file-access-from-files');
  }
  const browser = launch(flags);
  try {
    const session = await open(browser, url);
    return await Promise.race([
      evaluate(browser, session, `(${spec.test.toString()})()`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('test timed out')), spec.timeout || 20000)),
    ]);
  } finally {
    await browser.close();
    if (server) server.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function screenshot(spec, size) {
  if (!CHROME) throw new Error('Chrome not found, set CHROME_PATH');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-shot-'));
  const browser = launch([`--force-device-scale-factor=${spec.scale || 1}`, '--allow-file-access-from-files']);
  try {
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, page(spec));
    const session = await open(browser, fileUrl(file), { width: size.width, height: size.height, deviceScaleFactor: spec.scale || 1 });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, session);
    return Buffer.from(data, 'base64');
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runPage, screenshot, available: Boolean(CHROME) };
