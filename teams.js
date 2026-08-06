// Teams DM sink — JS port of JiraAlerts/src/cards.py + notifier.py (#7).
//
// Sends the same flat six-field payload the Power Automate flow already
// renders (ticket, summary, headline, subline, snippet, url), so the flow's
// layout never changes; this file only builds the *data*. Headline/subline
// wording is copied verbatim from cards.py — the macOS toast is the message
// flattened, so structure comes from wording and punctuation, not markup.
//
// Optional: no TEAMS_WEBHOOK_URL in .env -> sendForEvent is a no-op.
// A successful Workflows webhook returns HTTP 202 with an empty body, so any
// 2xx is success.

const { config } = require('./poller');

// Interpolated values are sanitized (no quotes/backslashes/control chars) so
// they can't break the card JSON when the flow drops them into a string literal.
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .replace(/[\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Turn raw wiki-markup comment body into a short, readable snippet.
const MENTION_RE = /\[~(?:accountid:)?([^\]]+)\]/g;
function cleanSnippet(body, limit) {
  let text = String(body || '').replace(MENTION_RE, (_, name) => '@' + name);
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > limit) text = text.slice(0, limit - 1).replace(/\s+$/, '') + '…';
  return text;
}

function payload(ticket, summary, headline, subline, snippet, url) {
  return {
    ticket,
    summary: sanitize(summary) || '(no summary)',
    headline: sanitize(headline),
    subline: sanitize(subline),
    snippet: sanitize(snippet),
    url,
  };
}

function payloadForEvent(ev) {
  const base = config.baseUrl;
  switch (ev.type) {
    case 'comment':
    case 'mention': {
      const verb = ev.type === 'mention' ? 'mentioned you on' : 'commented on';
      return payload(
        ev.issueKey,
        ev.snippet,
        `${ev.author} ${verb} ${ev.issueKey}:`,
        '',
        sanitize(cleanSnippet(ev.body, config.snippetChars)) || '(no text body)',
        `${base}/browse/${ev.issueKey}?focusedCommentId=${ev.commentId}`
      );
    }
    case 'assigned':
      return payload(
        ev.issueKey, ev.snippet,
        `Tag, you're it — ${ev.issueKey}.`, '', '',
        `${base}/browse/${ev.issueKey}`
      );
    case 'reassigned':
      return payload(
        ev.issueKey, ev.snippet,
        `Not yours anymore :) ${ev.issueKey}.`,
        ev.newAssignee ? `Now assigned to ${ev.newAssignee}.` : 'Now unassigned.',
        '',
        `${base}/browse/${ev.issueKey}`
      );
    case 'digest': {
      const c = ev.counts || {};
      const parts = [];
      if (c.comments) parts.push(`${c.comments} new comment(s)`);
      if (c.assigned) parts.push(`${c.assigned} ticket(s) assigned to you`);
      if (c.reassigned) parts.push(`${c.reassigned} ticket(s) reassigned away`);
      const total = (c.comments || 0) + (c.assigned || 0) + (c.reassigned || 0);
      return payload(
        'Digest',
        `${total} Jira updates this cycle`,
        'Update burst.',
        parts.join(', ') + '.',
        `More than ${config.maxEventsPerCycle} alerts in one cycle were ` +
          'collapsed into this digest to avoid webhook throttling.',
        `${base}/issues/?jql=assignee%20%3D%20currentUser()`
      );
    }
    default:
      return null;
  }
}

// A test event still reaches this sink by design (#23): the tray's "Test flight"
// and TEST_FLIGHT=1 both go through dispatchEvent, so the one-poller-two-outputs
// fork (#7) stays smoke-testable in one click. The DM therefore has to say so.
// The flow's six-field layout is fixed, so the marker rides inside fields the
// flow already renders — a seventh field would be silently dropped. Nothing here
// is sanitized (payload() ran first), so keep these literals free of quotes and
// backslashes.
function markAsTest(body) {
  body.ticket = `[TEST] ${body.ticket}`;
  body.subline = body.subline
    ? `${body.subline} Sent by a jiraPlane test flight — not a real Jira event.`
    : 'Sent by a jiraPlane test flight — not a real Jira event.';
}

async function sendForEvent(ev) {
  if (!config || !config.teamsWebhookUrl) return;
  const body = payloadForEvent(ev);
  if (!body) return;
  if (ev.test) markAsTest(body);
  const resp = await fetch(config.teamsWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000), // matches the poller's TIMEOUT_MS
  });
  if (!(resp.status >= 200 && resp.status < 300)) {
    const text = (await resp.text()).slice(0, 500);
    throw new Error(`Teams webhook returned ${resp.status}: ${text}`);
  }
}

module.exports = { sendForEvent };
