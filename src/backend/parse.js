'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const { dbRun, getDb } = require('./db');
const { createEnrichmentProvider } = require('./enrichment');

// ── Page classification ───────────────────────────────────────────────────────

const BOFU_PATHS   = ['/pricing/', '/demo/', '/request-a-demo/', '/contact/', '/free-trial/'];
const MOFU_PREFIXES = ['/solutions/', '/products/', '/case-studies/', '/webinars/', '/customers/', '/what-is-knowledge-management-in-'];
const TOFU_PREFIXES = ['/blog/', '/resources/', '/about/'];
const ASSET_PREFIXES = ['/wp-content/', '/favicon', '/wp-json/', '/sitemap', '/robots'];
const NOISE_PATHS  = ['/wp-login.php', '/xmlrpc.php', '/wp-admin', '/.env', '/.git', '/phpmyadmin', '/admin/', '/backup'];
const BOT_UA_PATTERNS = ['googlebot', 'bingbot', 'semrushbot', 'ahrefsbot', 'dotbot', 'mj12bot',
                         'zgrab', 'nuclei', 'masscan', 'wpscan', 'python-requests', 'go-http-client',
                         'curl/', 'netcraft'];

function classifyPath(p) {
  if (BOFU_PATHS.includes(p))               return 'bofu';
  if (MOFU_PREFIXES.some(x => p.startsWith(x))) return 'mofu';
  if (p === '/' || TOFU_PREFIXES.some(x => p.startsWith(x))) return 'tofu';
  return null; // asset / noise / unknown
}

function isNoisePath(p) {
  return ASSET_PREFIXES.some(x => p.startsWith(x)) || NOISE_PATHS.some(x => p.startsWith(x));
}

function isBot(ua) {
  const u = ua.toLowerCase();
  return BOT_UA_PATTERNS.some(b => u.includes(b));
}

// ── Page → human-readable label ───────────────────────────────────────────────

const PAGE_LABELS = {
  '/':                                          'Homepage',
  '/pricing/':                                  'Pricing Page',
  '/demo/':                                     'Demo Page',
  '/request-a-demo/':                           'Demo Request',
  '/contact/':                                  'Contact Page',
  '/free-trial/':                               'Free Trial',
  '/solutions/':                                'Solutions Overview',
  '/solutions/customer-service/':               'Customer Service Solutions',
  '/solutions/financial-services/':             'Financial Services Solutions',
  '/solutions/telecom/':                        'Telecom Solutions',
  '/solutions/retail/':                         'Retail Solutions',
  '/solutions/healthcare/':                     'Healthcare Solutions',
  '/products/retail-banking-suite/':            'Retail Banking Suite',
  '/products/':                                 'Products Overview',
  '/products/email-management/':                'Email Management Product',
  '/products/chat-and-messaging/':              'Chat & Messaging Product',
  '/products/knowledge-management/':            'Knowledge Management Product',
  '/products/analytics/':                       'Analytics Product',
  '/customers/':                                'Customer Stories',
  '/case-studies/':                             'Case Studies',
  '/case-studies/global-bank-reduces-handle-time/': 'Global Bank Case Study',
  '/case-studies/telecom-giant-nps-improvement/':   'Telecom NPS Case Study',
  '/what-is-knowledge-management-in-healthcare-providers/': 'Healthcare Knowledge Management Guide',
  '/what-is-knowledge-management-in-health-insurance/': 'Health Insurance Knowledge Management Guide',
  '/what-is-knowledge-management-in-insurance/': 'Insurance Knowledge Management Guide',
  '/what-is-knowledge-management-in-financial-services/': 'Financial Services Knowledge Management Guide',
  '/what-is-knowledge-management-in-telco/':    'Telecom Knowledge Management Guide',
  '/webinars/':                                 'Webinars',
  '/blog/ai-in-customer-service-2024/':         'AI in Customer Service Blog',
  '/blog/how-to-reduce-contact-center-costs/':  'Reducing Contact Center Costs Blog',
  '/blog/knowledge-management-best-practices/': 'Knowledge Management Best Practices',
  '/blog/omnichannel-cx-guide/':                'Omnichannel CX Guide',
  '/blog/chatbot-vs-virtual-agent/':            'Chatbot vs Virtual Agent Blog',
  '/resources/':                                'Resources',
  '/resources/analyst-reports/':               'Analyst Reports',
  '/resources/ebooks/':                         'eBooks',
  '/about/':                                    'About Page',
};

function labelPath(p) {
  if (PAGE_LABELS[p]) return PAGE_LABELS[p];
  // Generic fallback: strip slashes and title-case
  const segment = p.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

// ── Session type ──────────────────────────────────────────────────────────────

function sessionType(pages) {
  if (pages.some(p => p === '/request-a-demo/' || p === '/free-trial/')) return 'conversion';
  if (pages.some(p => p === '/pricing/' || p === '/demo/' || p === '/contact/')) return 'high';
  if (pages.some(p => MOFU_PREFIXES.some(x => p.startsWith(x)))) return 'content';
  return 'entry';
}

// Title: most significant page in a session
function sessionTitle(pages, type) {
  if (type === 'conversion') {
    const p = pages.find(x => x === '/request-a-demo/' || x === '/free-trial/');
    return labelPath(p);
  }
  const ORDER = ['/pricing/', '/demo/', '/contact/', ...MOFU_PREFIXES, ...TOFU_PREFIXES, '/'];
  for (const prefix of ORDER) {
    const match = pages.find(p => p === prefix || p.startsWith(prefix));
    if (match) return labelPath(match);
  }
  return 'Website Visit';
}

// ── Interest scores ───────────────────────────────────────────────────────────

const INTEREST_PATHS = {
  'Agent Assist':        ['/solutions/customer-service/', '/products/chat-and-messaging/', '/products/email-management/', '/case-studies/global-bank-reduces-handle-time/'],
  'Knowledge Hub':       ['/products/knowledge-management/', '/blog/knowledge-management-best-practices/', '/what-is-knowledge-management-in-'],
  'AI Agents':           ['/products/chat-and-messaging/', '/blog/chatbot-vs-virtual-agent/', '/blog/ai-in-customer-service-2024/'],
  'Contact Center':      ['/solutions/', '/webinars/', '/case-studies/', '/customers/', '/products/analytics/'],
  'Customer Self-Service': ['/blog/omnichannel-cx-guide/', '/products/chat-and-messaging/'],
};

function computeInterestScores(pageCounts) {
  const raw = {};
  for (const [category, paths] of Object.entries(INTEREST_PATHS)) {
    let score = 0;
    for (const [page, count] of Object.entries(pageCounts)) {
      if (paths.some(x => page === x || page.startsWith(x))) {
        const weight = classifyPath(page) === 'bofu' ? 10 : classifyPath(page) === 'mofu' ? 5 : 2;
        score += weight * count;
      }
    }
    raw[category] = score;
  }
  const maxRaw = Math.max(1, ...Object.values(raw));
  const normalized = {};
  for (const [cat, score] of Object.entries(raw)) {
    normalized[cat] = Math.round((score / maxRaw) * 100);
  }
  return normalized;
}

// ── Timestamp parsing ─────────────────────────────────────────────────────────

const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

function parseNginxDate(str) {
  // "12/Jun/2026:15:41:23 -0700"
  const m = str.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})/);
  if (!m) return 0;
  const base = Date.UTC(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]);
  const sign  = m[7] === '+' ? 1 : -1;
  const offsetMs = sign * (+m[8] * 60 + +m[9]) * 60000;
  return base - offsetMs; // UTC
}

// ── Nginx log line parser ─────────────────────────────────────────────────────

function parseLine(line) {
  const re = /^(\S+) - - \[([^\]]+)\] "(\S+) (\S+) HTTP\/[\d.]+" (\d{3}) (\d+) "([^"]*)" "([^"]*)"/;
  const m  = line.match(re);
  if (!m) return null;
  return {
    ip:      m[1],
    ts:      parseNginxDate(m[2]),
    method:  m[3],
    path:    m[4].split('?')[0], // strip query string
    status:  parseInt(m[5], 10),
    bytes:   parseInt(m[6], 10),
    referer: m[7],
    ua:      m[8],
  };
}

// ── Log file reading ──────────────────────────────────────────────────────────

function readLogDir(logDir) {
  const entries = fs.readdirSync(logDir)
    .filter(f => f.startsWith('access.log'))
    .map(f => {
      const fullPath = path.join(logDir, f);
      if (f.endsWith('.gz')) {
        return zlib.gunzipSync(fs.readFileSync(fullPath)).toString('utf8');
      }
      return fs.readFileSync(fullPath, 'utf8');
    });
  return entries.join('');
}

// ── Referrer + UA formatting ──────────────────────────────────────────────────

function formatReferrer(ref) {
  if (!ref || ref === '-') return 'Direct';
  if (ref.includes('google.com/search')) {
    const q = ref.match(/[?&]q=([^&]+)/);
    return q ? `Google Search — "${decodeURIComponent(q[1].replace(/\+/g, ' '))}"` : 'Google Search';
  }
  if (ref.includes('google.com'))  return 'Google';
  if (ref.includes('bing.com'))    return 'Bing Search';
  if (ref.includes('linkedin.com') || ref.includes('lnkd.in')) return 'LinkedIn';
  if (ref.includes('t.co'))        return 'Twitter/X';
  if (ref.includes('gartner.com')) return 'Gartner.com';
  if (ref.includes('g2.com'))      return 'G2.com';
  if (ref.includes('capterra.com')) return 'Capterra';
  if (ref.includes('egain.com'))   return 'Internal (egain.com)';
  return ref.replace(/^https?:\/\//, '').split('/')[0];
}

function formatDevice(ua) {
  let device = 'Desktop';
  if (/iPhone|Android.*Mobile/.test(ua))  device = 'Mobile';
  else if (/iPad|Android(?!.*Mobile)/.test(ua)) device = 'Tablet';

  let browser = 'Browser';
  if (/Edg\//.test(ua))                  browser = 'Edge';
  else if (/Firefox\//.test(ua))         browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Chrome\//.test(ua))          browser = 'Chrome';

  return `${device} · ${browser}`;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET';
}

// ── Sessionization ────────────────────────────────────────────────────────────
// 30-minute idle gap = new session.
// Hits are grouped by IP first so that interleaved hits from different company
// visitors (same account, different IP addresses) don't create false session
// splits. Without this, a hit from IP-B arriving between two IP-A hits would
// incorrectly break IP-A's session in two.

const SESSION_GAP_MS = 30 * 60 * 1000;

function sessionize(hits) {
  if (!hits.length) return [];

  const byIp = {};
  for (const h of hits) {
    (byIp[h.ip] || (byIp[h.ip] = [])).push(h);
  }

  const sessions = [];
  for (const ipHits of Object.values(byIp)) {
    ipHits.sort((a, b) => a.ts - b.ts);
    let current = { ip: ipHits[0].ip, hits: [ipHits[0]] };
    for (let i = 1; i < ipHits.length; i++) {
      const h    = ipHits[i];
      const last = current.hits[current.hits.length - 1];
      if (h.ts - last.ts < SESSION_GAP_MS) {
        current.hits.push(h);
      } else {
        sessions.push(current);
        current = { ip: h.ip, hits: [h] };
      }
    }
    sessions.push(current);
  }

  sessions.sort((a, b) => a.hits[0].ts - b.hits[0].ts);
  return sessions;
}

// ── Session → client-ready object ────────────────────────────────────────────

function buildSessionObj(session, ipToVisitorId, sessionIndex) {
  const { ip, hits } = session;
  const contentHits = hits.filter(h => !isNoisePath(h.path));
  if (!contentHits.length) return null;

  const firstTs = contentHits[0].ts;
  const lastTs  = contentHits[contentHits.length - 1].ts;
  const durationS = Math.max(30, Math.round((lastTs - firstTs) / 1000));

  const pages   = [...new Set(contentHits.map(h => h.path))];
  const type    = sessionType(pages);
  const title   = sessionTitle(pages, type);
  const referer = formatReferrer(contentHits[0].referer);
  const device  = formatDevice(contentHits[0].ua);
  const visitorId = ipToVisitorId[ip];

  const detail = pages.slice(0, 5).map(p => {
    const label = labelPath(p);
    const cls   = classifyPath(p);
    if (cls === 'bofu') return `Visited ${label}`;
    if (cls === 'mofu') return `Explored ${label}`;
    return `Viewed ${label}`;
  });

  return {
    id:               sessionIndex,
    ts:               firstTs,
    formattedDate:    formatDate(firstTs),
    formattedTime:    formatTime(firstTs),
    visitorId,
    type,
    title,
    pageCount:        pages.length,
    durationS,
    formattedDuration: formatDuration(durationS),
    pages,
    detail,
    referrer: referer,
    device,
  };
}

// ── Log directory resolution ──────────────────────────────────────────────────
// If LOG_DIR is set, use it. Otherwise auto-discover the latest run subdir
// under src/log-generator/logs/ — enables zero-config use inside Docker.

function resolveLogDir() {
  if (process.env.LOG_DIR) return path.resolve(process.env.LOG_DIR);
  // Default: the generator writes directly into this directory (no timestamped subdirs).
  // Point LOG_DIR at a different path to parse real nginx logs instead.
  return path.resolve('src/log-generator/logs');
}

// ── Main ingest pipeline ──────────────────────────────────────────────────────

async function run() {
  const logDir = resolveLogDir();
  const enrichment = createEnrichmentProvider();
  console.log(`\nReading logs from: ${logDir}`);
  console.log(`  Enrichment provider: ${enrichment.name}`);

  const raw = readLogDir(logDir);
  const lines = raw.split('\n').filter(Boolean);
  console.log(`  Raw lines: ${lines.length.toLocaleString()}`);

  // Parse and filter all lines
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;

  // Bucket hits by enriched company profile.
  const companyHits = {};
  const companyProfiles = new Map();
  const ipCache = new Map();

  async function resolveIp(ip) {
    if (!ipCache.has(ip)) ipCache.set(ip, await enrichment.resolveIp(ip));
    return ipCache.get(ip);
  }

  let skipped = 0;
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) { skipped++; continue; }
    if (isBot(entry.ua)) continue;
    if (isNoisePath(entry.path)) continue;
    if (!classifyPath(entry.path)) continue; // skip unknown paths

    const profile = await resolveIp(entry.ip);
    if (!profile) continue; // generic visitor — not tracked

    companyProfiles.set(profile.id, profile);
    (companyHits[profile.id] || (companyHits[profile.id] = [])).push(entry);
  }
  console.log(`  Skipped (unparseable): ${skipped}`);

  // Compute raw intent scores for normalization
  const rawScores = {};

  for (const profile of companyProfiles.values()) {
    const hits = companyHits[profile.id];
    let raw = 0;
    for (const h of hits) {
      const cls = classifyPath(h.path);
      if (cls === 'bofu') raw += 10;
      else if (cls === 'mofu') raw += 5;
      else if (cls === 'tofu') raw += 2;
    }
    rawScores[profile.id] = raw;
  }
  const maxRaw = Math.max(1, ...Object.values(rawScores));

  // Treat each parse as an authoritative rebuild of the generated dataset.
  // Otherwise removed fixture accounts can survive from earlier parse runs.
  getDb().exec('DELETE FROM accounts');
  getDb().exec('DELETE FROM ai_content');

  // Build and persist each account
  const upsert = getDb().prepare(`
    INSERT OR REPLACE INTO accounts
      (id, name, domain, industry, employees, revenue, hq, initials, color,
       intent_score, fit_score, buying_stage, total_sessions, unique_ips,
       last_activity, trend, interest_scores, top_pages, sessions)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?)
  `);

  for (const profile of companyProfiles.values()) {
    const hits = companyHits[profile.id];
    if (!hits.length) continue;

    // Build IP → visitor ID map for this company
    const uniqueIps = [...new Set(hits.map(h => h.ip))];
    const ipToVisitorId = {};
    uniqueIps.forEach((ip, i) => { ipToVisitorId[ip] = `V-${String(i + 1).padStart(3, '0')}`; });

    // Sessionize
    const rawSessions = sessionize(hits);
    const sessionObjs = rawSessions
      .map((s, i) => buildSessionObj(s, ipToVisitorId, i + 1))
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts); // newest first

    const totalSessions = sessionObjs.length;
    const lastActivity  = sessionObjs[0]?.ts ?? 0;

    // Buying stage: look at all pages visited
    const allPages = hits.map(h => h.path);
    const hasBofu  = allPages.some(p => classifyPath(p) === 'bofu');
    const hasMofu  = allPages.some(p => classifyPath(p) === 'mofu');
    const buyingStage = hasBofu ? 'Evaluation' : hasMofu ? 'Research' : 'Awareness';

    // Intent score (normalized 0-100)
    const intentScore = Math.round((rawScores[profile.id] / maxRaw) * 100);

    // Trend: this week vs prior week
    const thisWeek  = hits.filter(h => h.ts >= now - weekMs).length;
    const priorWeek = hits.filter(h => h.ts >= now - 2 * weekMs && h.ts < now - weekMs).length;
    const trend = priorWeek > 0
      ? Math.round(((thisWeek - priorWeek) / priorWeek) * 100)
      : thisWeek > 0 ? 100 : 0;

    // Page counts (content pages only)
    const pageCounts = {};
    for (const h of hits) {
      if (classifyPath(h.path)) pageCounts[h.path] = (pageCounts[h.path] || 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p, views]) => ({ path: p, label: labelPath(p), views }));

    const interestScores = computeInterestScores(pageCounts);

    upsert.run(
      profile.id, profile.name, profile.domain, profile.industry,
      profile.employees, profile.revenue, profile.hq, profile.initials, profile.color,
      intentScore, profile.fit_score, buyingStage, totalSessions, uniqueIps.length,
      lastActivity, trend,
      JSON.stringify(interestScores),
      JSON.stringify(topPages),
      JSON.stringify(sessionObjs),
    );

    console.log(`  [${profile.id.padEnd(12)}] ${String(hits.length).padStart(5)} hits → ${totalSessions} sessions  stage=${buyingStage}  intent=${intentScore}`);
  }

  console.log('\nDone. Database written to src/backend/egain.db\n');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
