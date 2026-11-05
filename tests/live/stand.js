const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 9333;

const RELAY = `
process.on('uncaughtException', (e) => log('uncaught', e.message));
require('net').createServer((sock) => {
  sock.on('error', () => {});
  let buffer = '';
  sock.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      let q;
      try { q = JSON.parse(line); } catch { continue; }
      const reply = (o) => sock.write(JSON.stringify(o) + '\\n');
      if (q.op === 'sessions') reply([...sessions].map((sid) => ({ sid, url: String((global.__info.get(sid) || {}).url).slice(0, 120) })));
      else if (q.op === 'cdp') send(q.method, q.params || {}, q.sid, (r) => reply(r || {}));
      else if (q.op === 'trigger') { global.__trigger(q.version); reply({ ok: 1 }); }
    }
  });
}).listen(${PORT}, '127.0.0.1');
`;

const patch = (source) => {
  let s = source.replace(/\r\n/g, '\n');
  const swap = (from, to) => {
    if (!s.includes(from)) throw new Error(`stand: anchor not found: ${from.slice(0, 50)}`);
    s = s.replace(from, to);
  };
  swap("const guard = require('./guard');", 'const guard = { watchUpdate() {}, relaunchAfterExit(l, done) { done(); } };\nglobal.__info = new Map();');
  const start = s.indexOf("require('./update')(log, (version) => {");
  const end = s.indexOf('\n});\n', start);
  if (start < 0 || end < 0) throw new Error('stand: update hook not found');
  s = s.slice(0, start) + 'global.__trigger = (version) => {' + s.slice(start + "require('./update')(log, (version) => {".length, end) + '\n};\n' + s.slice(end + 5);
  swap('      sessions.add(sid);\n', '      sessions.add(sid); global.__info.set(sid, msg.params.targetInfo);\n');
  return s + RELAY;
};

function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-stand-'));
  for (const name of ['desktop', 'tooltips', 'update-button.js', 'userContent.css']) fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  fs.rmSync(path.join(dir, 'desktop', 'launch.log'), { force: true });
  const file = path.join(dir, 'desktop', 'launch.js');
  fs.writeFileSync(file, patch(fs.readFileSync(file, 'utf8')));
  return { dir, file, log: path.join(dir, 'desktop', 'launch.log') };
}

function start(stand) {
  const child = spawn(process.execPath, [stand.file], { stdio: 'ignore', windowsHide: true });
  return child;
}

const ask = (q) => new Promise((resolve, reject) => {
  const socket = net.connect(PORT, '127.0.0.1');
  let buffer = '';
  const timer = setTimeout(() => { socket.destroy(); reject(new Error('relay timeout')); }, 20000);
  socket.on('data', (d) => {
    buffer += d;
    const i = buffer.indexOf('\n');
    if (i >= 0) { clearTimeout(timer); socket.end(); resolve(JSON.parse(buffer.slice(0, i))); }
  });
  socket.on('error', (e) => { clearTimeout(timer); reject(e); });
  socket.write(JSON.stringify(q) + '\n');
});

const evaluate = async (sid, expression) => {
  const r = await ask({ op: 'cdp', sid, method: 'Runtime.evaluate', params: { returnByValue: true, awaitPromise: true, expression } });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms = 8000, step = 150) {
  const limit = Date.now() + ms;
  let last;
  while (Date.now() < limit) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(step);
  }
  throw new Error(`condition not met in ${ms} ms${last instanceof Error ? `: ${last.message}` : ''}`);
}

module.exports = { build, start, ask, evaluate, sleep, until, PORT };
