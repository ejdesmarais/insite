'use strict';

require('dotenv').config();
const { createJsonChatCompletion } = require('./adapters/openaiAdapter');

const MODEL       = process.env.OPENAI_MODEL        || 'gpt-5-nano';
const MAX_TOKENS  = parseInt(process.env.OPENAI_MAX_INPUT_TOKENS || '3000', 10);

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

Important distinction:
- The summary, stage rationale, and recommendations are internal sales intelligence for an eGain seller.
- The email is customer-facing outreach. It must read like a thoughtful human wrote it to another human.

For internal sales intelligence, be specific, concise, and grounded in the actual data provided.

For the customer-facing email:
- Do not expose internal scoring, funnel labels, or CRM-style fields. Never mention Account Fit Score, Intent Score, ICP, buying stage, stage names, page view counts, visitor counts, sessions, IPs, or "BOFU/MOFU/TOFU".
- Do not say or imply surveillance of specific web behavior. Avoid phrases like "I noticed you viewed pricing/demo/free trial pages", "your team has been actively researching us", or "given your current evaluation stage".
- Do not assume the prospect is evaluating eGain unless the provided data explicitly supports a softer phrasing. Prefer "if your team is exploring..." or "for organizations looking at..." over "as you evaluate eGain".
- Lead with a plausible business problem for the prospect's industry and role context, then connect eGain to that problem in plain language.
- Keep the ask small: usually a brief conversation, sharing a relevant example, or comparing approaches. Avoid prescribing demos, trials, pricing discussions, ROI calculators, or multi-step sales motions in the first email.
- Use natural, low-pressure language. Avoid hype, over-personalization, feature piles, and generic "Team" greetings when a contact name is unknown.

Respond ONLY with valid JSON matching the requested schema - no markdown, no explanation.`;

// ── Main export ───────────────────────────────────────────────────────────────

async function generateAccountContent(account) {
  const payload = trimPayload(account);

  const userMessage = `
Company: ${payload.name}
Industry: ${payload.industry}
Size: ${payload.employees} employees, ${payload.revenue} revenue
HQ: ${payload.hq}
Account Fit Score: ${payload.fit_score}/100
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
    "body": "<customer-facing outreach email>"
  }
}

Provide 3–4 recommendations ordered by priority.

Email requirements:
- 90–150 words.
- Start with "Hi [Name]," unless a real contact name is provided.
- Do not mention fit scores, intent scores, buying stages, sessions, page views, IPs, pricing-page visits, demo-page visits, free-trial interest, or other internal tracking details.
- Do not include a "Proposed next steps" section.
- Do not ask for a 60-minute demo, guided trial, or pricing discussion.
- Mention at most two eGain capabilities, and only after framing the prospect's likely business problem.
- End with one low-pressure question.`;

  const raw = await createJsonChatCompletion({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  });

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON response: ${raw.slice(0, 200)}`);
  }
}

module.exports = { generateAccountContent };
