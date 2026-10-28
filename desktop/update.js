// Self-update on launch. Updates the folder it runs from in place, never creates a copy.
// A git checkout gets `git pull --ff-only`. A zip install (no .git) downloads the main branch zip and copies
// the files over this folder. Never blocks the launch. When files changed, onUpdated(version) is called, where
// version is the subject of the latest commit (e.g. "v.1.14"). The new code applies on the next Figma start.
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
  const before = await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  // Public repo over https, so no SSH key or credentials are needed whatever origin points to.
  await run('git', ['pull', '--ff-only', `https://github.com/${REPO}.git`, 'main'], { cwd: ROOT, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const after = await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  if (before === after) { log('update git: up to date'); return null; }
  const version = await run('git', ['log', '-1', '--format=%s'], { cwd: ROOT });
  log('update git: updated to', version);
  return version;
}

async function updateZip(log) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
    headers: { 'User-Agent': 'figma-tweaks', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const commit = await res.json();
  const sha = commit.sha;
  const version = String(commit.commit.message).split('\n')[0].trim();
  let current = null;
  try { current = fs.readFileSync(VERSION_FILE, 'utf8').trim(); } catch {}
  if (current === null) { fs.writeFileSync(VERSION_FILE, sha); log('update zip: first run, version recorded'); return null; } // fresh install is already the latest
  if (sha === current) { log('update zip: up to date'); return null; }

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
    log('update zip: updated to', version);
    return version;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = function update(log, onUpdated) {
  const job = fs.existsSync(path.join(ROOT, '.git')) ? updateGit : updateZip;
  job(log).then((version) => { if (version) onUpdated(version); }).catch((e) => log('update failed:', e.message));
};
