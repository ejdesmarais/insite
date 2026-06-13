'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { dbGet, dbAll, dbRun, getDb } = require('./db');
const { generateAccountContent } = require('./ai');
const { resolveCompanyFromIpWithKickFire } = require('./services/kickfireService');

const PORT = parseInt(process.env.PORT || '3082', 10);
const REGEN_LIMIT_ENABLED = process.env.REGEN_RATE_LIMIT_ENABLED !== 'false';
const REGEN_COOLDOWN_MS   = 60 * 60 * 1000; // 1 hour
const HAS_OPENAI_KEY      = !!process.env.OPENAI_API_KEY;
const DIST_DIR = path.join(__dirname, '../../dist');

const app = express();
app.use(cors());
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAccount(row) {
  if (!row) return null;
  return {
    ...row,
    interest_scores: JSON.parse(row.interest_scores || '{}'),
    top_pages:       JSON.parse(row.top_pages       || '[]'),
    sessions:        JSON.parse(row.sessions        || '[]'),
  };
}

function accountSummary(row) {
  // Lightweight version for list responses — omits sessions blob
  return {
    id:           row.id,
    name:         row.name,
    domain:       row.domain,
    industry:     row.industry,
    employees:    row.employees,
    revenue:      row.revenue,
    hq:           row.hq,
    site:         row.domain,
    initials:     row.initials,
    color:        row.color,
    icp:          row.icp_score,
    intent:       row.intent_score,
    stage:        row.buying_stage,
    visitors:     row.unique_ips,
    trend:        row.trend,
    lastActivity: row.last_activity,
    totalSessions: row.total_sessions,
  };
}

function computeKpis(rows) {
  const highIntent  = rows.filter(r => r.intent_score >= 75).length;
  const repeatVisitors = rows.reduce((sum, r) => {
    const sessions = JSON.parse(r.sessions || '[]');
    const ipCounts = {};
    for (const s of sessions) {
      ipCounts[s.visitorId] = (ipCounts[s.visitorId] || 0) + 1;
    }
    return sum + Object.values(ipCounts).filter(c => c >= 2).length;
  }, 0);
  const trendingUp = rows.filter(r => r.trend > 0).length;

  return {
    companiesIdentified: rows.length,
    highIntentAccounts:  highIntent,
    repeatVisitors,
    trendingUp,
  };
}

function computeInsights(rows) {
  const insights = [];

  // Vertical with most activity
  const byIndustry = {};
  for (const r of rows) {
    byIndustry[r.industry] = (byIndustry[r.industry] || 0) + r.total_sessions;
  }
  const topIndustry = Object.entries(byIndustry).sort((a, b) => b[1] - a[1])[0];
  if (topIndustry) {
    insights.push({
      tag: 'Vertical signal',
      text: `${topIndustry[0]} accounts are your most active segment this period — ${topIndustry[1]} sessions across ${rows.filter(r => r.industry === topIndustry[0]).length} identified accounts.`,
    });
  }

  // Accounts in Evaluation stage
  const evaluating = rows.filter(r => r.buying_stage === 'Evaluation');
  if (evaluating.length) {
    insights.push({
      tag: 'Stage change',
      text: `${evaluating.length} account${evaluating.length > 1 ? 's are' : ' is'} in the Evaluation stage based on pricing and demo page activity: ${evaluating.map(r => r.name).join(', ')}.`,
    });
  }

  // High intent accounts
  const hot = rows.filter(r => r.intent_score >= 80).sort((a, b) => b.intent_score - a.intent_score);
  if (hot.length) {
    insights.push({
      tag: 'High intent',
      text: `${hot[0].name} has the strongest intent signal (score ${hot[0].intent_score}) with ${hot[0].total_sessions} sessions in the tracking window.`,
    });
  }

  // Trending accounts
  const surging = rows.filter(r => r.trend >= 50).sort((a, b) => b.trend - a.trend);
  if (surging.length) {
    insights.push({
      tag: 'Trending up',
      text: `${surging[0].name} activity is up ${surging[0].trend}% week-over-week — a significant spike worth immediate outreach.`,
    });
  }

  return insights.slice(0, 4);
}

function isValidIpv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d+$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json({ hasOpenAI: HAS_OPENAI_KEY });
});

// GET /api/enrichment/resolve-company?ip=209.128.119.100
app.get('/api/enrichment/resolve-company', async (req, res) => {
  const ip = String(req.query.ip || '').trim();
  if (!isValidIpv4(ip)) {
    return res.status(400).json({
      error: 'invalid_ip',
      message: 'Query parameter "ip" must be a valid IPv4 address.',
    });
  }

  try {
    res.json(await resolveCompanyFromIpWithKickFire(ip));
  } catch (err) {
    console.error('[kickfire] Enrichment failed:', err.code || err.message);
    res.status(500).json({
      error: err.code || 'enrichment_failed',
      message: err.code === 'missing_kickfire_api_key'
        ? 'KICKFIRE_API_KEY is required for KickFire enrichment.'
        : 'KickFire enrichment failed unexpectedly.',
    });
  }
});

// GET /api/accounts
app.get('/api/accounts', (req, res) => {
  const rows = dbAll('SELECT * FROM accounts ORDER BY intent_score DESC');
  const kpis = computeKpis(rows);
  const insights = computeInsights(rows);
  res.json({
    accounts: rows.map(accountSummary),
    kpis,
    insights,
  });
});

// GET /api/accounts/:id
app.get('/api/accounts/:id', (req, res) => {
  const row = dbGet('SELECT * FROM accounts WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Account not found' });

  const account = parseAccount(row);
  const summary = accountSummary(row);

  // Visitor summary: group sessions by visitorId
  const visitorMap = {};
  for (const s of account.sessions) {
    if (!visitorMap[s.visitorId]) visitorMap[s.visitorId] = { sessions: 0, pages: new Set() };
    visitorMap[s.visitorId].sessions++;
    for (const p of s.pages) visitorMap[s.visitorId].pages.add(p);
  }
  const visitorSummary = Object.entries(visitorMap).map(([id, v]) => ({
    visitorId: id,
    sessionCount: v.sessions,
    uniquePages: v.pages.size,
  }));

  // Avg pages per session
  const totalPages   = account.sessions.reduce((s, x) => s + x.pageCount, 0);
  const pagesPerSession = account.sessions.length
    ? Math.round((totalPages / account.sessions.length) * 10) / 10
    : 0;

  // Avg duration
  const totalDuration = account.sessions.reduce((s, x) => s + x.durationS, 0);
  const avgDurationS  = account.sessions.length
    ? Math.round(totalDuration / account.sessions.length)
    : 0;

  // Compute page-category counts from the full session list (not the truncated
  // topPages list, which misses paths outside the top 8).
  const BOFU_PATHS = ['/pricing/', '/demo/', '/request-a-demo/', '/contact/', '/free-trial/'];
  const pricingVisits   = account.sessions.filter(s => s.pages?.some(p => BOFU_PATHS.includes(p))).length;
  const productVisits   = account.sessions.filter(s => s.pages?.some(p => p.startsWith('/products/'))).length;
  const caseStudyViews  = account.sessions.filter(s => s.pages?.some(p => p.startsWith('/case-studies/'))).length;

  res.json({
    ...summary,
    interestScores: account.interest_scores,
    topPages:       account.top_pages,
    sessions:       account.sessions.slice(0, 30), // cap at 30 for timeline
    visitorSummary,
    pagesPerSession,
    avgDurationS,
    pricingVisits,
    productVisits,
    caseStudyViews,
  });
});

// Shared helper: read cached ai_content rows into a response object
function readCachedAi(id) {
  const rows = dbAll('SELECT type, content FROM ai_content WHERE account_id = ?', [id]);
  if (rows.length < 4) return null;
  const out = {};
  for (const row of rows) out[row.type] = JSON.parse(row.content);
  const ts = dbGet('SELECT MAX(generated_at) as ts FROM ai_content WHERE account_id = ?', [id])?.ts;
  return { ...out, generatedAt: ts };
}

function localAiFallback(accountRow) {
  const account = parseAccount(accountRow);
  const topPage = account.top_pages?.[0]?.label || 'the website';
  const stage = account.buying_stage || 'Awareness';
  const focus = Object.entries(account.interest_scores || {})
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'customer service AI';

  return {
    summary: `${account.name} shows ${stage.toLowerCase()}-stage interest based on ${account.total_sessions} sessions from ${account.unique_ips} identified visitor${account.unique_ips === 1 ? '' : 's'}. The strongest observed signal is engagement with ${topPage}, with highest product interest around ${focus}.`,
    stage_rationale: `The ${stage} stage is inferred from the mix of pages visited, recency, and depth of activity in the parsed weblog sessions.`,
    recommendations: [
      {
        title: `Lead with ${focus}`,
        body: `Open outreach around ${focus} because it is the strongest interest area in this account's observed web activity.`,
        priority: 'high',
      },
      {
        title: 'Reference recent site behavior',
        body: `Mention the recent engagement with ${topPage} and connect it to a practical customer service outcome.`,
        priority: 'medium',
      },
      {
        title: 'Confirm evaluation priorities',
        body: 'Ask which contact center, knowledge, or self-service initiatives are active this quarter before pitching a specific package.',
        priority: 'medium',
      },
    ],
    email: {
      subject: `${account.name} and ${focus}`,
      body: `Hi,\n\nI noticed recent interest from ${account.name} around ${focus} and related eGain content. Teams looking at these topics are often evaluating ways to improve service accuracy, agent productivity, and customer self-service.\n\nWould it be useful to compare what you are seeing today with how eGain customers approach this?\n\nBest,`,
    },
    generatedAt: Date.now(),
    isDefault: true,
  };
}

// Shared helper: call OpenAI, persist result, return response object
async function generateAndStore(id, accountRow) {
  const account = parseAccount(accountRow);
  const result  = await generateAccountContent(account);
  const now     = Date.now();
  const insert  = getDb().prepare(
    'INSERT OR REPLACE INTO ai_content (account_id, type, content, generated_at) VALUES (?, ?, ?, ?)'
  );
  for (const type of ['summary', 'stage_rationale', 'recommendations', 'email']) {
    insert.run(id, type, JSON.stringify(result[type] ?? null), now);
  }
  return { ...result, generatedAt: now };
}

// GET /api/accounts/:id/ai  —  generate on first call, serve from DB after.
// Without an API key, always serves from DB (pre-seeded defaults).
app.get('/api/accounts/:id/ai', async (req, res) => {
  const { id } = req.params;

  const cached = readCachedAi(id);
  if (cached) return res.json(cached);

  const accountRow = dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
  if (!accountRow) return res.status(404).json({ error: 'Account not found' });

  if (!HAS_OPENAI_KEY) {
    return res.json(localAiFallback(accountRow));
  }

  try {
    res.json(await generateAndStore(id, accountRow));
  } catch (err) {
    console.error('[ai] Generation failed:', err.message);
    res.status(502).json({ error: 'AI generation failed', detail: err.message });
  }
});

// POST /api/accounts/:id/ai/regenerate
// Without an API key, returns the cached defaults instead of regenerating.
app.post('/api/accounts/:id/ai/regenerate', async (req, res) => {
  const { id } = req.params;

  if (!HAS_OPENAI_KEY) {
    const cached = readCachedAi(id);
    if (cached) return res.json({ ...cached, isDefault: true });
    const accountRow = dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!accountRow) return res.status(404).json({ error: 'Account not found' });
    return res.json(localAiFallback(accountRow));
  }

  if (REGEN_LIMIT_ENABLED) {
    const latest = dbGet('SELECT MAX(generated_at) as ts FROM ai_content WHERE account_id = ?', [id]);
    if (latest?.ts && Date.now() - latest.ts < REGEN_COOLDOWN_MS) {
      return res.status(429).json({
        error: 'Rate limit: regeneration allowed once per hour',
        retry_after: latest.ts + REGEN_COOLDOWN_MS,
      });
    }
  }

  dbRun('DELETE FROM ai_content WHERE account_id = ?', [id]);

  const accountRow = dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
  if (!accountRow) return res.status(404).json({ error: 'Account not found' });

  try {
    res.json(await generateAndStore(id, accountRow));
  } catch (err) {
    console.error('[ai] Regeneration failed:', err.message);
    res.status(502).json({ error: 'AI generation failed', detail: err.message });
  }
});

// ── Static frontend ───────────────────────────────────────────────────────────

const fs = require('fs');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
