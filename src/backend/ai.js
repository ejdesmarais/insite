'use strict';

require('dotenv').config();
const OpenAI = require('openai');

// ── Lazy client — validated on first call, not at require() time ──────────────

let _client;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.template to .env and fill in your key.');
  }
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const MODEL       = process.env.OPENAI_MODEL        || 'gpt-5-nano';
const MAX_RETRIES = parseInt(process.env.OPENAI_MAX_RETRIES || '6', 10);
const MAX_TOKENS  = parseInt(process.env.OPENAI_MAX_INPUT_TOKENS || '3000', 10);

// ── Exponential backoff with jitter ──────────────────────────────────────────
// Per OpenAI Cookbook best practices: retry on 429 and 5xx only; fail fast on
// 400/401/404 (won't self-resolve). Jitter prevents thundering-herd on
// concurrent retries.

const RETRY_ON = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn) {
  const initialDelay = 1000;
  const base         = 2;
  const maxDelay     = 60000;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status ?? err.response?.status;

      if (!RETRY_ON.has(status) || attempt >= MAX_RETRIES) {
        throw err;
      }

      // jitter: delay = min(base^attempt * initial, maxDelay) * (1 + random)
      const jitter    = Math.random();
      const delay     = Math.min(initialDelay * Math.pow(base, attempt) * (1 + jitter), maxDelay);
      const delaySecs = (delay / 1000).toFixed(1);

      console.warn(`[ai] OpenAI ${status} — retry ${attempt + 1}/${MAX_RETRIES} in ${delaySecs}s`);
      await sleep(delay);
      attempt++;
    }
  }
}

// ── Token budget: trim sessions to avoid context_length_exceeded ──────────────
// Approximation: 4 chars ≈ 1 token. Good enough as a guard.

function trimPayload(account) {
  const copy = { ...account, sessions: [...(account.sessions || [])] };

  while (copy.sessions.length > 0) {
    const estimate = Math.ceil(JSON.stringify(copy).length / 4);
    if (estimate <= MAX_TOKENS) break;
    copy.sessions.shift(); // drop oldest session
  }

  const original = account.sessions?.length ?? 0;
  const trimmed  = copy.sessions.length;
  if (trimmed < original) {
    console.warn(`[ai] Payload trimmed from ${original} to ${trimmed} sessions to fit token budget`);
  }

  return copy;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a sales intelligence assistant for eGain, a customer service AI platform.
Given web activity data for a prospect company, produce four pieces of structured sales intelligence.
Be specific, concise, and grounded in the actual data provided.
Respond ONLY with valid JSON matching the requested schema — no markdown, no explanation.`;

// ── Main export ───────────────────────────────────────────────────────────────

async function generateAccountContent(account) {
  const payload = trimPayload(account);

  const userMessage = `
Company: ${payload.name}
Industry: ${payload.industry}
Size: ${payload.employees} employees, ${payload.revenue} revenue
HQ: ${payload.hq}
ICP Score: ${payload.icp_score}/100
Intent Score: ${payload.intent_score}/100
Buying Stage: ${payload.buying_stage}
Total Sessions: ${payload.total_sessions}
Unique Visitors: ${payload.unique_ips}
Last Activity: ${new Date(payload.last_activity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

Interest by product area (0–100):
${JSON.stringify(payload.interest_scores, null, 2)}

Top pages visited:
${(payload.top_pages || []).map(p => `  ${p.path} — ${p.views} views`).join('\n')}

Recent sessions (newest first):
${(payload.sessions || []).slice(0, 15).map(s =>
  `  [${s.formattedDate} ${s.formattedTime}] ${s.title} — ${s.formattedDuration}, ${s.pageCount} pages, via ${s.referrer}`
).join('\n')}

Respond with this JSON schema:
{
  "summary": "<2–3 sentence executive summary of this account's web activity and buying signal>",
  "stage_rationale": "<1–2 sentences explaining why the buying stage was inferred from observed behavior>",
  "recommendations": [
    { "title": "<action title>", "body": "<specific rationale tied to observed activity>", "priority": "high | medium" }
  ],
  "email": {
    "subject": "<email subject line>",
    "body": "<full email body, personalized to the observed content and signals>"
  }
}

Provide 3–4 recommendations ordered by priority.`;

  const response = await withRetry(() =>
    getClient().chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
    })
  );

  const raw = response.choices[0].message.content;

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON response: ${raw.slice(0, 200)}`);
  }
}

module.exports = { generateAccountContent };
