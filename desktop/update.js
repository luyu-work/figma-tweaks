// Self-update on launch. Updates the folder it runs from in place, never creates a copy.
// A git checkout gets `git pull --ff-only`. A zip install (no .git) downloads the main branch zip and copies
// the files over this folder. Never blocks the launch. The new code applies on the next Figma start.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'luyu-work/figma-tweaks';
const ROOT = path.join(__dirname, '..');
const VERSION_FILE = path.join(ROOT, '.version');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim()));
      else resolve(stdout.toString().trim());
    });
  });
}

async function updateGit(log) {
  const out = await run('git', ['pull', '--ff-only'], { cwd: ROOT });
  log('update git:', out.split('\n').pop());
}

async function updateZip(log) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
    headers: { 'User-Agent': 'figma-tweaks', Accept: 'application/vnd.github.sha' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const sha = (await res.text()).trim();
  let current = '';
  try { current = fs.readFileSync(VERSION_FILE, 'utf8').trim(); } catch {}
  if (sha === current) { log('update zip: up to date'); return; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-tweaks-'));
  try {
    const zip = path.join(tmp, 'ft.zip');
    const dl = await fetch(`https://github.com/${REPO}/archive/refs/heads/main.zip`, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok) throw new Error(`download ${dl.status}`);
    fs.writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
    await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`]);
    const src = path.join(tmp, fs.readdirSync(tmp).find((d) => fs.statSync(path.join(tmp, d)).isDirectory()));
    fs.cpSync(src, ROOT, { recursive: true, force: true });
    fs.writeFileSync(VERSION_FILE, sha);
    log('update zip: updated to', sha.slice(0, 7));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = function update(log) {
  const job = fs.existsSync(path.join(ROOT, '.git')) ? updateGit : updateZip;
  job(log).catch((e) => log('update failed:', e.message));
};
