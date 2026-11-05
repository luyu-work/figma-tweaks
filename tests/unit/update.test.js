const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newerTag, parseTag, payloadFields, verifyPayload, dropStale } = require('../../desktop/update');

const sorted = (tags) => [...tags].sort(newerTag);

test('release tags are parsed, anything else is rejected', () => {
  assert.deepEqual(parseTag('v.1.43'), { major: 1, minor: '43' });
  for (const bad of ['v1.43', 'v.1', 'v.1.4.2', '1.43', 'v.a.b', 'v.1.', '']) assert.equal(parseTag(bad), null, bad);
});

test('the minor part is a decimal fraction, v.1.4 is 1.40', () => {
  assert.deepEqual(sorted(['v.1.41', 'v.1.4', 'v.1.36', 'v.1.5']), ['v.1.36', 'v.1.4', 'v.1.41', 'v.1.5']);
  assert.equal(newerTag('v.1.4', 'v.1.40'), 0);
});

test('major versions outrank minor ones', () => {
  assert.deepEqual(sorted(['v.2.01', 'v.1.99', 'v.10.0', 'v.2.1']), ['v.1.99', 'v.2.01', 'v.2.1', 'v.10.0']);
});

test('two digit tags stay in release order', () => {
  const tags = ['v.1.10', 'v.1.11', 'v.1.20', 'v.1.30', 'v.1.40', 'v.1.41', 'v.1.42', 'v.1.43', 'v.1.44', 'v.1.45'];
  assert.deepEqual(sorted([...tags].reverse()), tags);
});

test('payload fields stop at the message body', () => {
  const f = payloadFields('object abc\ntype commit\ntag v.1.1\ntagger x\n\ntag fake\nobject evil\n');
  assert.equal(f.tag, 'v.1.1');
  assert.equal(f.object, 'abc');
  assert.equal(f.type, 'commit');
});

test('the first value of a repeated header wins', () => {
  assert.equal(payloadFields('tag v.1.1\ntag v.9.9\n\n').tag, 'v.1.1');
});

const sign = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-sign-'));
  const key = path.join(dir, 'key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], { windowsHide: true });
  const signers = path.join(dir, 'allowed_signers');
  fs.writeFileSync(signers, `luyu-work namespaces="git" ${fs.readFileSync(key + '.pub', 'utf8').trim().split(' ').slice(0, 2).join(' ')}\n`);
  const payload = `object ${'a'.repeat(40)}\ntype commit\ntag v.1.50\ntagger luyu-work <x@y> 1 +0000\n\nrelease\n`;
  const body = path.join(dir, 'payload');
  fs.writeFileSync(body, payload);
  execFileSync('ssh-keygen', ['-Y', 'sign', '-f', key, '-n', 'git', body], { windowsHide: true });
  return { dir, signers, payload, signature: fs.readFileSync(body + '.sig', 'utf8') };
};

test('a valid signature returns the tagged commit', async (t) => {
  const s = sign();
  t.after(() => fs.rmSync(s.dir, { recursive: true, force: true }));
  assert.equal(await verifyPayload(s.payload, s.signature, 'v.1.50', s.signers), 'a'.repeat(40));
});

test('a tampered payload is rejected', async (t) => {
  const s = sign();
  t.after(() => fs.rmSync(s.dir, { recursive: true, force: true }));
  await assert.rejects(verifyPayload(s.payload.replace('release', 'evil'), s.signature, 'v.1.50', s.signers), /signature rejected/);
  await assert.rejects(verifyPayload(s.payload.replace('a'.repeat(40), 'b'.repeat(40)), s.signature, 'v.1.50', s.signers), /signature rejected/);
});

test('a signed tag served under another tag name is rejected', async (t) => {
  const s = sign();
  t.after(() => fs.rmSync(s.dir, { recursive: true, force: true }));
  await assert.rejects(verifyPayload(s.payload, s.signature, 'v.1.51', s.signers), /bad payload/);
});

test('a signature of an unknown key is rejected', async (t) => {
  const s = sign(), other = sign();
  t.after(() => { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(other.dir, { recursive: true, force: true }); });
  await assert.rejects(verifyPayload(s.payload, s.signature, 'v.1.50', other.signers), /signature rejected/);
});

test('a payload that is not a commit tag is rejected', async () => {
  await assert.rejects(verifyPayload(`object ${'a'.repeat(40)}\ntype tree\ntag v.1.50\n\n`, 'sig', 'v.1.50'), /bad payload/);
  await assert.rejects(verifyPayload('object nothex\ntype commit\ntag v.1.50\n\n', 'sig', 'v.1.50'), /bad payload/);
});

test('the shipped allowed_signers names the release principal for git', () => {
  const line = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'allowed_signers'), 'utf8').trim();
  assert.match(line, /^luyu-work namespaces="git" ssh-ed25519 AAAA/);
});

test('files a release removed are deleted, kept ones stay', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-stale-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const next = path.join(dir, 'next'), current = path.join(dir, 'current');
  fs.mkdirSync(next); fs.mkdirSync(current);
  for (const f of ['10-a.js', '20-b.js']) fs.writeFileSync(path.join(next, f), '');
  for (const f of ['10-a.js', '20-b.js', '60-old.js']) fs.writeFileSync(path.join(current, f), '');
  fs.mkdirSync(path.join(current, 'leftover'));
  dropStale(next, current);
  assert.deepEqual(fs.readdirSync(current).sort(), ['10-a.js', '20-b.js']);
});

test('nothing is deleted when the release has no such folder', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-stale-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'keep.js'), '');
  dropStale(path.join(dir, 'missing'), dir);
  assert.deepEqual(fs.readdirSync(dir), ['keep.js']);
});
