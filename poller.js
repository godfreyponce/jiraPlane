// Jira Data Center poller — JS port of JiraAlerts/src (jira_client.py + run.py patterns).
// Read-only: only GETs. Auth is a Personal Access Token sent as a Bearer header
// (DC/Server scheme; Jira Cloud uses email+token Basic auth instead).
//
// Four event streams per cycle:
//   1. New comments on tickets currently assigned to you
//   2. New comments that @mention you (any ticket)
//   3. Tickets newly assigned to you (diff vs last cycle's set)
//   4. Tickets reassigned away from you (newly absent from that set) — DM-only,
//      the plane deliberately skips this stream (#2, upheld in #7)
// Comments you authored yourself are always skipped.
//
// Battle-tested patterns kept from the Python original:
//   - dedup seen-set persisted to state.json (gitignored)
//   - silent first-run seed (no backlog flood)
//   - flood valve: > MAX_EVENTS_PER_CYCLE events -> one digest event

const fs = require('fs');
const path = require('path');

// --- config from .env (gitignored; real shell env wins over the file) ---

function loadEnv() {
  const vars = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // no .env — buildConfig reports what's missing
  }
  return { ...vars, ...process.env };
}

function buildConfig() {
  const env = loadEnv();
  const need = (name) => {
    if (!env[name]) throw new Error(`missing ${name} (set it in .env)`);
    return env[name];
  };
  return {
    baseUrl: need('JIRA_BASE_URL').replace(/\/+$/, ''),
    pat: need('JIRA_PAT'),
    username: need('JIRA_USERNAME'),
    userKey: need('JIRA_USER_KEY'),
    // Defaults mirror JiraAlerts/src/config.py; the valve threshold of 3 is from issue #2.
    pollSeconds: parseInt(env.POLL_SECONDS || '60', 10),
    lookbackMinutes: parseInt(env.LOOKBACK_MINUTES || '30', 10),
    commentsPerIssue: parseInt(env.COMMENTS_PER_ISSUE || '20', 10),
    pruneDays: parseInt(env.PRUNE_DAYS || '30', 10),
    maxEventsPerCycle: parseInt(env.MAX_EVENTS_PER_CYCLE || '3', 10),
    // Teams DM sink (#7): optional — empty string disables the sink entirely.
    teamsWebhookUrl: env.TEAMS_WEBHOOK_URL || '',
    snippetChars: parseInt(env.SNIPPET_CHARS || '280', 10),
    // Overlay sink (#8): optional the same way the Teams sink is — PLANE=0
    // means Teams DMs only, no flying plane.
    plane: env.PLANE !== '0',
    statePath: path.join(__dirname, 'state.json'),
  };
}

let config = null;
let configError = null;
try {
  config = buildConfig();
} catch (e) {
  configError = e;
}

// --- Jira HTTP (GET only; POST /search can 401 on DC XSRF checks) ---

const TIMEOUT_MS = 30_000; // matches JiraAlerts _TIMEOUT

async function get(pathname, params) {
  const url = new URL(config.baseUrl + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.pat}`,
      Accept: 'application/json',
      // Jira DC XSRF guard: harmless on GETs.
      'X-Atlassian-Token': 'no-check',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const err = new Error(`GET ${pathname} -> HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function search(jql) {
  const data = await get('/rest/api/2/search', {
    jql,
    fields: 'summary',
    maxResults: 100,
    validateQuery: 'warn',
  });
  return data.issues || [];
}

async function recentComments(issueKey) {
  const data = await get(`/rest/api/2/issue/${issueKey}/comment`, {
    orderBy: '-created',
    maxResults: config.commentsPerIssue,
  });
  return data.comments || [];
}

// --- state.json: { initialized, seen: {commentId: iso}, assignees: {issueKey: iso} } ---

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(config.statePath, 'utf8'));
    return {
      initialized: false,
      seen: {},
      assignees: {},
      ...data,
    };
  } catch {
    // Missing or corrupt file -> start clean rather than crash.
    return { initialized: false, seen: {}, assignees: {} };
  }
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function saveState(st) {
  st.seen = sortKeys(st.seen);
  st.assignees = sortKeys(st.assignees);
  fs.writeFileSync(config.statePath, JSON.stringify(st, null, 2) + '\n');
}

function pruneSeen(st) {
  const cutoff = Date.now() - config.pruneDays * 24 * 60 * 60 * 1000;
  const kept = {};
  for (const [id, ts] of Object.entries(st.seen)) {
    const seenAt = Date.parse(ts);
    // Unparseable timestamp -> keep it (safer than re-flying).
    if (Number.isNaN(seenAt) || seenAt >= cutoff) kept[id] = ts;
  }
  st.seen = kept;
}

const nowIso = () => new Date().toISOString();

// --- the three streams ---

function mentionsMe(body) {
  return [`[~${config.username}]`, `[~accountid:${config.userKey}]`].some((t) =>
    body.includes(t)
  );
}

async function collectRelevantComments() {
  const w = config.lookbackMinutes;
  const assignedJql = `assignee = currentUser() AND updated >= -${w}m ORDER BY updated DESC`;
  // Comment text search is best-effort, and the ONLY way to catch mentions on
  // tickets not currently assigned to you.
  const mentionJql = `comment ~ "${config.username}" AND updated >= -${w}m ORDER BY updated DESC`;

  const assigned = new Map((await search(assignedJql)).map((i) => [i.key, i]));
  let mentionIssues = new Map();
  try {
    mentionIssues = new Map((await search(mentionJql)).map((i) => [i.key, i]));
  } catch {
    // Some DC text-index configs reject `comment ~`; degrade gracefully.
  }

  const results = [];
  const cutoff = Date.now() - w * 60 * 1000;
  for (const [key, issue] of new Map([...mentionIssues, ...assigned])) {
    const summary = (issue.fields && issue.fields.summary) || '(no summary)';
    const onAssignedIssue = assigned.has(key);
    for (const c of await recentComments(key)) {
      if (c.created && Date.parse(c.created) < cutoff) {
        continue; // pre-existing history (a newly-assigned ticket's backlog) is not news
      }
      const author = c.author || {};
      if (author.name === config.username || author.key === config.userKey) {
        continue; // your own comments are noise, not news
      }
      const body = c.body || '';
      const mentions = mentionsMe(body);
      if (!onAssignedIssue && !mentions) continue;
      results.push({
        issueKey: key,
        summary,
        commentId: String(c.id),
        author: author.displayName || 'Unknown',
        body,
        created: c.created || '',
        mentions,
      });
    }
  }
  return results;
}

async function currentAssignments() {
  // No time window: current state, not an event feed. Diffed against last
  // cycle's set to detect "assigned to you".
  const out = {};
  for (const i of await search('assignee = currentUser() ORDER BY updated DESC')) {
    out[i.key] = (i.fields && i.fields.summary) || '(no summary)';
  }
  return out;
}

async function fetchAssignees(keys) {
  // For tickets that left your plate, look up who has them now.
  if (!keys.length) return {};
  const data = await get('/rest/api/2/search', {
    jql: `key in (${keys.join(',')})`,
    fields: 'summary,assignee',
    maxResults: 100,
  });
  const out = {};
  for (const i of data.issues || []) {
    const a = (i.fields && i.fields.assignee) || null;
    out[i.key] = {
      assignee: a ? a.displayName : null,
      isMe: !!a && (a.name === config.username || a.key === config.userKey),
      summary: (i.fields && i.fields.summary) || '(no summary)',
    };
  }
  return out;
}

// --- one polling cycle: returns plane events ({type, issueKey, snippet}) ---

async function cycle() {
  const st = loadState();
  const comments = await collectRelevantComments();
  const assignmentsNow = await currentAssignments();
  const currentKeys = Object.keys(assignmentsNow);

  // First run: seed everything silently so the backlog doesn't fly a plane storm.
  if (!st.initialized) {
    for (const c of comments) st.seen[c.commentId] = nowIso();
    st.assignees = Object.fromEntries(currentKeys.map((k) => [k, nowIso()]));
    st.initialized = true;
    pruneSeen(st);
    saveState(st);
    console.log(
      `poller: seeded ${comments.length} comment(s) and ${currentKeys.length} assignment(s) silently`
    );
    return [];
  }

  const newComments = comments
    .filter((c) => !(c.commentId in st.seen))
    .sort((a, b) => (a.created < b.created ? -1 : 1));
  const newlyAssigned = currentKeys.filter((k) => !(k in st.assignees)).sort();

  // Reassigned away (#7, ported from JiraAlerts run.py): tickets that left
  // last cycle's set. Look up who has them now; one that's still yours left
  // the active set for another reason (e.g. closed) — not a reassignment.
  const leftMe = Object.keys(st.assignees).filter((k) => !(k in assignmentsNow)).sort();
  const reassigned = [];
  if (leftMe.length) {
    const info = await fetchAssignees(leftMe);
    for (const k of leftMe) {
      const meta = info[k] || {};
      if (meta.isMe) {
        console.log(`poller: skipped ${k} — left active set but still yours (closed?)`);
        continue;
      }
      reassigned.push({
        type: 'reassigned',
        issueKey: k,
        snippet: meta.summary || '',
        newAssignee: meta.assignee || null,
      });
    }
  }

  const events = [
    ...newComments.map((c) => ({
      type: c.mentions ? 'mention' : 'comment',
      issueKey: c.issueKey,
      snippet: c.summary,
      author: c.author,
      body: c.body,
      commentId: c.commentId,
    })),
    ...newlyAssigned.map((k) => ({
      type: 'assigned',
      issueKey: k,
      snippet: assignmentsNow[k],
    })),
    ...reassigned,
  ];

  // Advance state before returning: a plane can't fail like a webhook, so
  // everything surfaced this cycle counts as seen. Departed tickets drop out
  // of tracking (re-fire if they ever come back).
  for (const c of newComments) st.seen[c.commentId] = nowIso();
  st.assignees = Object.fromEntries(
    currentKeys.map((k) => [k, st.assignees[k] || nowIso()])
  );
  pruneSeen(st);
  saveState(st);

  // Flood valve: burst -> one digest (one plane AND one DM, same rules).
  if (events.length > config.maxEventsPerCycle) {
    console.log(`poller: flood valve — ${events.length} event(s) collapsed into a digest`);
    return [{
      type: 'digest',
      issueKey: '',
      snippet: `${events.length} Jira updates`,
      counts: {
        comments: newComments.length,
        assigned: newlyAssigned.length,
        reassigned: reassigned.length,
      },
    }];
  }

  if (events.length) {
    for (const e of events) console.log(`poller: ${e.type} ${e.issueKey}`);
  }
  return events;
}

module.exports = { cycle, config, configError };
