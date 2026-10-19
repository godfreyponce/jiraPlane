// Update check (#48): git/npm process work only. No Electron import, so it runs under plain
// node; main.js owns the schedule, the popover state, and the restart.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION_TAG = /^v\d+\.\d+\.\d+$/;
// A hung fetch must not wedge main's one-at-a-time guard for the day. 60 s is a guess.
const GIT_TIMEOUT_MS = 60_000;
// A hung install must not hold flights forever; an Electron download on a slow link
// takes minutes. 15 min is a guess.
const INSTALL_TIMEOUT_MS = 15 * 60_000;

// launchd's PATH is /usr/bin:/bin:/usr/sbin:/sbin (#24), so resolve absolute paths up front.
function resolveBin(name) {
  const dirs = [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  for (const dir of dirs) {
    if (dir && fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  }
  return '';
}

const GIT_BIN = resolveBin('git');
const NPM_BIN = resolveBin('npm');

// npm is a `#!/usr/bin/env node` script: its own directory goes on the child's PATH so
// `env` finds the node that sits beside it.
const childEnv = NPM_BIN
  ? { ...process.env, PATH: `${path.dirname(NPM_BIN)}:${process.env.PATH || ''}` }
  : process.env;

// git and npm both end on advice ("…and the repository exists.", npm's log path), so the
// first error line names the failure; any other stderr falls back to its last line.
function errorLine(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /^(fatal:|error:|npm ERR!|npm error )/.test(l)) || lines.pop() || '';
}

function run(bin, args, repoDir, timeout = GIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd: repoDir, env: childEnv, timeout, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout, stderr });
        const e = new Error(errorLine(stderr) || (err.killed ? `${path.basename(bin)} timed out` : err.message));
        e.code = err.code;
        reject(e);
      });
  });
}

// The commands a reader of the log needs, in the #22 form: `<iso> update: <command> ok|failed`.
async function logged(bin, args, repoDir, timeout) {
  const command = `${path.basename(bin)} ${args.join(' ')}`;
  console.log(`${new Date().toISOString()} update: ${command} start`);
  try {
    const out = await run(bin, args, repoDir, timeout);
    console.log(`${new Date().toISOString()} update: ${command} ok`);
    return out;
  } catch (e) {
    console.error(`${new Date().toISOString()} update: ${command} failed: ${e.message}`);
    throw e;
  }
}

function compareVersions(a, b) {
  const [x, y] = [a, b].map((t) => t.slice(1).split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

// Where HEAD stands against the newest vX.Y.Z tag on the remote (#57):
// { tag, relation: 'on' | 'ahead' | 'behind', ref }. ref names HEAD (branch, or
// short commit when detached) for 'ahead' only. Rejects when no such tag exists.
// Remote tags only: a tag that was never pushed (or made in a worktree, whose refs
// the main checkout shares) is not a release.
async function check(repoDir) {
  if (!GIT_BIN) throw new Error('git not found');
  const { stdout } = await run(GIT_BIN, ['ls-remote', '--tags', '--refs', 'origin'], repoDir);
  const tags = stdout.split('\n').map((line) => line.split('\trefs/tags/')[1] || '')
    .filter((t) => VERSION_TAG.test(t));
  if (!tags.length) throw new Error('no vX.Y.Z tags on origin');
  const tag = tags.sort(compareVersions).pop();
  // Refuses, and so rejects, if a local tag of the same name points elsewhere.
  await run(GIT_BIN, ['fetch', '--quiet', 'origin', 'tag', tag], repoDir);
  // ^{commit}: an annotated tag names a tag object, not the commit HEAD can equal.
  const [head, tagCommit] = (await run(GIT_BIN, ['rev-parse', 'HEAD', `${tag}^{commit}`], repoDir))
    .stdout.trim().split('\n');
  if (head === tagCommit) return { tag, relation: 'on', ref: '' };
  try {
    await run(GIT_BIN, ['merge-base', '--is-ancestor', tag, 'HEAD'], repoDir);
  } catch (e) {
    if (e.code === 1) return { tag, relation: 'behind', ref: '' };
    throw e;
  }
  let ref;
  try {
    ref = (await run(GIT_BIN, ['symbolic-ref', '--short', '-q', 'HEAD'], repoDir)).stdout.trim();
  } catch (e) {
    if (e.code !== 1) throw e; // exit 1 = detached HEAD
    ref = (await run(GIT_BIN, ['rev-parse', '--short', 'HEAD'], repoDir)).stdout.trim();
  }
  return { tag, relation: 'ahead', ref };
}

// '' when the clone may update; otherwise why not. Local edits are never touched.
async function blocker(repoDir) {
  if (!GIT_BIN) return 'git not found';
  if (!NPM_BIN) return 'npm not found on this PATH';
  const { stdout } = await run(GIT_BIN, ['status', '--porcelain', '--untracked-files=no'], repoDir);
  const edited = stdout.split('\n').filter(Boolean).map((line) => line.slice(3));
  if (edited.length) return `local edits in ${edited.slice(0, 3).join(', ')}`;
  try {
    const branch = (await run(GIT_BIN, ['symbolic-ref', '--short', '-q', 'HEAD'], repoDir)).stdout.trim();
    if (branch !== 'main') return `on branch ${branch}`;
  } catch (e) {
    if (e.code !== 1) throw e; // exit 1 = detached HEAD, which is allowed
  }
  return '';
}

async function install(repoDir, tag) {
  await logged(GIT_BIN, ['-c', 'advice.detachedHead=false', 'checkout', '--detach', tag], repoDir);
  await logged(NPM_BIN, ['install'], repoDir, INSTALL_TIMEOUT_MS);
  // Electron 43 has no postinstall: its binary arrives on the first `npm start`.
  // The login job runs that binary directly, so a tag that bumps Electron would
  // leave it nothing to restart. The script is a no-op when the binary is there.
  await logged(path.join(path.dirname(NPM_BIN), 'node'), ['node_modules/electron/install.js'], repoDir, INSTALL_TIMEOUT_MS);
}

module.exports = { GIT_BIN, NPM_BIN, check, blocker, install };
