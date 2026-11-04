// Self-update on launch. Updates the folder it runs from in place, never creates a copy.
// Only signed release tags are installed, never the main branch. A tag must carry an SSH signature that matches
// desktop/allowed_signers of the code that is already installed (the new copy of that file is not trusted until
// the tag passes). No valid signature, no update. When files changed, onUpdated(version) is called, where
// version is the tag name (e.g. "v.1.14"). The new code applies on the next Figma start.
// A git checkout fetches tags and verifies them with git. A zip install (no .git) reads the tag object from the
// GitHub API, verifies it with ssh-keygen (OpenSSH ships with Windows) and downloads the zip of the tagged commit.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'luyu-work/figma-tweaks';
const PRINCIPAL = 'luyu-work';
const ROOT = path.join(__dirname, '..');
const SIGNERS = path.join(__dirname, 'allowed_signers');
const VERSION_FILE = path.join(ROOT, '.version');
const API_HEADERS = { 'User-Agent': 'figma-tweaks', Accept: 'application/vnd.github+json' };

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { input, ...rest } = opts;
    const child = execFile(cmd, args, { windowsHide: true, timeout: 120000, ...rest }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim()));
      else resolve(stdout.toString().trim());
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// "v.1.4" -> { major: 1, minor: '4' }. Anything else is not a release tag. The minor part is a decimal fraction
// written without trailing zeros, so v.1.4 means 1.40, it is newer than v.1.36 and older than v.1.41.
function parseTag(name) {
  const m = /^v\.(\d+)\.(\d+)$/.exec(name);
  return m ? { major: Number(m[1]), minor: m[2] } : null;
}

function newerTag(a, b) {
  const x = parseTag(a), y = parseTag(b);
  if (x.major !== y.major) return x.major - y.major;
  const n = Math.max(x.minor.length, y.minor.length);
  return Number(x.minor.padEnd(n, '0')) - Number(y.minor.padEnd(n, '0'));
}

// The signed payload names the tag and the commit. The name must match the ref, otherwise a validly signed
// old tag could be served under a newer tag name.
function payloadFields(payload) {
  const f = {};
  for (const line of payload.split('\n')) {
    if (line === '') break;
    const i = line.indexOf(' ');
    if (i > 0 && !(line.slice(0, i) in f)) f[line.slice(0, i)] = line.slice(i + 1);
  }
  return f;
}

// payload is the tag object without its signature block, signature is the armored SSH signature.
async function verifyPayload(payload, signature, tag, signers = SIGNERS) {
  const f = payloadFields(payload);
  if (f.tag !== tag || f.type !== 'commit' || !/^[0-9a-f]{40}$/.test(f.object || '')) throw new Error(`tag ${tag}: bad payload`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-tweaks-sig-'));
  try {
    const sigFile = path.join(tmp, 'tag.sig');
    fs.writeFileSync(sigFile, signature.endsWith('\n') ? signature : signature + '\n');
    await run('ssh-keygen', ['-Y', 'verify', '-f', signers, '-I', PRINCIPAL, '-n', 'git', '-s', sigFile], { input: payload });
  } catch (e) {
    throw new Error(`tag ${tag}: signature rejected (${e.message})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return f.object;
}

async function updateGit(log) {
  const before = await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  // Public repo over https, so no SSH key or credentials are needed whatever origin points to.
  await run('git', ['fetch', '--force', `https://github.com/${REPO}.git`, '+refs/tags/*:refs/tags/*'], { cwd: ROOT, env });
  const tags = (await run('git', ['tag', '--list', 'v.*'], { cwd: ROOT })).split(/\r?\n/).filter(parseTag);
  if (!tags.length) { log('update git: no release tags'); return null; }
  const tag = tags.sort(newerTag).pop();
  const raw = await run('git', ['cat-file', 'tag', `refs/tags/${tag}`], { cwd: ROOT });
  const f = payloadFields(raw);
  if (f.tag !== tag || f.type !== 'commit') throw new Error(`tag ${tag}: not an annotated tag of a commit`);
  try {
    await run('git', ['-c', `gpg.ssh.allowedSignersFile=${SIGNERS}`, 'verify-tag', `refs/tags/${tag}`], { cwd: ROOT, env });
  } catch (e) {
    throw new Error(`tag ${tag}: signature rejected (${e.message})`);
  }
  await run('git', ['merge', '--ff-only', f.object], { cwd: ROOT, env });
  const after = await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  if (before === after) { log('update git: up to date'); return null; }
  log('update git: updated to', tag);
  return tag;
}

async function updateZip(log) {
  const refsRes = await fetch(`https://api.github.com/repos/${REPO}/git/matching-refs/tags/v.?per_page=100`, { headers: API_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!refsRes.ok) throw new Error(`api ${refsRes.status}`);
  const refs = (await refsRes.json())
    .map((r) => ({ tag: String(r.ref).replace(/^refs\/tags\//, ''), sha: r.object && r.object.sha, type: r.object && r.object.type }))
    .filter((r) => parseTag(r.tag) && r.type === 'tag' && /^[0-9a-f]{40}$/.test(r.sha));
  if (!refs.length) { log('update zip: no release tags'); return null; }
  const latest = refs.sort((a, b) => newerTag(a.tag, b.tag)).pop();

  let current = null;
  try { current = fs.readFileSync(VERSION_FILE, 'utf8').trim(); } catch {}
  if (current === null) { fs.writeFileSync(VERSION_FILE, latest.sha); log('update zip: first run, version recorded'); return null; } // fresh install is already the latest
  if (latest.sha === current) { log('update zip: up to date'); return null; }

  const tagRes = await fetch(`https://api.github.com/repos/${REPO}/git/tags/${latest.sha}`, { headers: API_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!tagRes.ok) throw new Error(`api ${tagRes.status}`);
  const v = (await tagRes.json()).verification || {};
  if (!v.signature || !v.payload) throw new Error(`tag ${latest.tag}: not signed`);
  const commit = await verifyPayload(v.payload, v.signature, latest.tag);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-tweaks-'));
  try {
    const zip = path.join(tmp, 'ft.zip');
    const dl = await fetch(`https://github.com/${REPO}/archive/${commit}.zip`, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok) throw new Error(`download ${dl.status}`);
    fs.writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
    await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`]);
    const src = path.join(tmp, fs.readdirSync(tmp).find((d) => fs.statSync(path.join(tmp, d)).isDirectory()));
    fs.cpSync(src, ROOT, { recursive: true, force: true });
    fs.writeFileSync(VERSION_FILE, latest.sha);
    log('update zip: updated to', latest.tag);
    return latest.tag;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = function update(log, onUpdated) {
  const job = fs.existsSync(path.join(ROOT, '.git')) ? updateGit : updateZip;
  job(log).then((version) => { if (version) onUpdated(version); }).catch((e) => log('update failed:', e.message));
};
module.exports.verifyPayload = verifyPayload;
module.exports.newerTag = newerTag;
