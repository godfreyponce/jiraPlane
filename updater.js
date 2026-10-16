// Update check (#48): git/npm process work only. No Electron import, so it runs under plain
// node; main.js owns the schedule, the popover state, and the restart.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION_TAG = /^v\d+\.\d+\.\d+$/;
// A hung fetch must not wedge main's one-at-a-time guard for the day. 60 s is a guess.
const GIT_TIMEOUT_MS = 60_000;

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
        const e = new Error(errorLine(stderr) || err.message);
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

// The newest vX.Y.Z tag that HEAD does not already contain, or null.
async function check(repoDir) {
  if (!GIT_BIN) throw new Error('git not found');
  await logged(GIT_BIN, ['fetch', '--quiet', '--tags', 'origin'], repoDir);
  const { stdout } = await run(GIT_BIN, ['tag', '-l', 'v*', '--sort=-v:refname'], repoDir);
  const tag = stdout.split('\n').find((t) => VERSION_TAG.test(t));
  if (!tag) return null;
  try {
    await run(GIT_BIN, ['merge-base', '--is-ancestor', tag, 'HEAD'], repoDir);
    return null;
  } catch (e) {
    if (e.code === 1) return tag;
    throw e;
  }
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
  // No timeout: npm may download an Electron build, which can take minutes.
  await logged(NPM_BIN, ['install'], repoDir, 0);
}

module.exports = { GIT_BIN, NPM_BIN, check, blocker, install };
