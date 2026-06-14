#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── Config ───────────────────────────────────────────────────────────────────

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const TZ_OFFSET = config.timezone || '+0000';

// Parse the TZ offset to milliseconds so fmtNginxDate can convert UTC → local.
// e.g. "-0700" → -420 min → -25200000 ms
const _tzm = TZ_OFFSET.match(/^([+-])(\d{2})(\d{2})$/);
const TZ_OFFSET_MS = _tzm
  ? (_tzm[1] === '+' ? 1 : -1) * (parseInt(_tzm[2], 10) * 60 + parseInt(_tzm[3], 10)) * 60000
  : 0;

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function makePRNG(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makePRNG(config.seed || 42);

const randInt   = (lo, hi) => Math.floor(rand() * (hi - lo + 1)) + lo;
const randFloat = (lo, hi) => rand() * (hi - lo) + lo;
const choice    = (arr)    => arr[Math.floor(rand() * arr.length)];

function weightedChoice(items) {
  let r = rand() * items.reduce((s, i) => s + i.w, 0);
  for (const item of items) { r -= item.w; if (r <= 0) return item; }
  return items[items.length - 1];
}

// Box-Muller for Gaussian noise (clamp to [0,1])
function gaussian(mu, sigma) {
  const u = 1 - rand(), v = 1 - rand();
  return Math.max(0, Math.min(1, mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

// ─── Timeframe parsing ────────────────────────────────────────────────────────

function parseTimeframe(tf) {
  const m = String(tf).trim().match(/^(\d+)(w|d|h)$/i);
  if (!m) throw new Error(`Invalid timeframe "${tf}". Use: 1w, 2d, 3h`);
  const val  = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const MS   = { w: 7 * 86400e3, d: 86400e3, h: 3600e3 };
  return { val, unit, totalMs: val * MS[unit], unitMs: MS[unit] };
}

// ─── Data: company profiles (insight-worthy traffic) ─────────────────────────
//
// Real enterprise prospects whose IP ranges resolve to their corporate network.
// IPs were identified via reverse-IP lookup; in production these would come from
// a live enrichment service (e.g. KickFire, Clearbit Reveal, 6sense).
//
// Arc controls visit-timing distribution; role (in VISITOR_ROLES) controls
// which page clusters each IP draws from.

const COMPANY_PROFILES = [
  {
    id: 'kaiser',
    name: 'Kaiser Permanente',
    domain: 'kaiserpermanente.org',
    industry: 'Healthcare',
    ips: ['162.119.232.100', '162.119.17.100', '198.140.10.100', '162.119.80.100', '162.119.160.100'],
    arc: 'hot_lead',        // ramps from awareness → pricing/demo; clear evaluation signal
    sessionBudget: 42,
    peakHourUTC: 16,
  },
  {
    id: 'cigna',
    name: 'Cigna',
    domain: 'cigna.com',
    industry: 'Health Insurance',
    ips: ['170.48.10.100', '170.48.64.100', '162.20.100.100', '170.48.120.100', '170.48.200.100'],
    arc: 'steady_researcher', // methodical multi-stakeholder evaluation pace
    sessionBudget: 20,
    peakHourUTC: 14,
  },
  {
    id: 'aetna',
    name: 'Aetna',
    domain: 'aetna.com',
    industry: 'Health Insurance',
    ips: ['152.145.224.100', '152.145.10.100', '152.145.200.100', '152.145.80.100', '152.145.160.100'],
    arc: 'late_surge',      // quiet first week, then evaluators hit BOFU pages
    sessionBudget: 16,
    peakHourUTC: 17,
  },
  {
    id: 'progressive',
    name: 'Progressive',
    domain: 'progressive.com',
    industry: 'Insurance',
    ips: ['170.218.100.100', '170.218.50.50', '170.218.200.100', '170.218.25.100', '170.218.150.100'],
    arc: 'multi_user',      // multiple teams (claims, CX, IT) researching independently
    sessionBudget: 28,
    peakHourUTC: 15,
  },
  {
    id: 'pnc',
    name: 'PNC',
    domain: 'pnc.com',
    industry: 'Banking',
    ips: ['161.150.193.15', '161.150.80.100', '170.201.64.100', '161.150.120.100', '170.201.160.100'],
    arc: 'early_funnel',    // awareness stage; blog and resources only
    sessionBudget: 14,
    peakHourUTC: 14,
  },
  {
    id: 'spectrum',
    name: 'Spectrum',
    domain: 'spectrum.com',
    industry: 'Telecommunications',
    ips: ['71.44.80.100', '107.14.120.100', '69.134.189.100', '71.44.90.100', '71.44.70.100'],
    arc: 'lurker',          // frequent short visits; researching but not yet engaging
    sessionBudget: 12,
    peakHourUTC: 16,
  },
  {
    id: 'xfinity',
    name: 'Xfinity / Comcast',
    domain: 'comcast.com',
    industry: 'Telecommunications',
    ips: ['73.142.51.8', '96.112.47.15', '96.112.237.100', '73.50.100.100', '96.113.100.100'],
    arc: 'careers_only',    // competitive reconnaissance / job-seekers — not a buying signal
    sessionBudget: 8,
    peakHourUTC: 14,
  },
];

// ─── Data: URL catalog ────────────────────────────────────────────────────────

const PAGES = {
  // Top-of-funnel / awareness
  tofu: [
    ['/blog/ai-in-customer-service-2024/', 200, 45200],
    ['/blog/how-to-reduce-contact-center-costs/', 200, 38400],
    ['/blog/knowledge-management-best-practices/', 200, 41100],
    ['/blog/omnichannel-cx-guide/', 200, 52300],
    ['/blog/chatbot-vs-virtual-agent/', 200, 37800],
    ['/resources/', 200, 28900],
    ['/resources/analyst-reports/', 200, 31200],
    ['/resources/ebooks/', 200, 29800],
    ['/', 200, 68400],
    ['/about/', 200, 32100],
  ],
  // Middle-of-funnel / consideration
  mofu: [
    ['/solutions/', 200, 41600],
    ['/solutions/customer-service/', 200, 44200],
    ['/products/', 200, 48200],
    ['/products/email-management/', 200, 39800],
    ['/products/chat-and-messaging/', 200, 40300],
    ['/products/knowledge-management/', 200, 37900],
    ['/products/analytics/', 200, 38500],
    ['/customers/', 200, 44500],
    ['/case-studies/', 200, 34600],
    ['/webinars/', 200, 28100],
  ],
  industry_mofu: {
    healthcare: [
      ['/solutions/healthcare/', 200, 40900],
      ['/what-is-knowledge-management-in-healthcare-providers/', 200, 46200],
      ['/customers/', 200, 44500],
    ],
    health_insurance: [
      ['/solutions/healthcare/', 200, 40900],
      ['/what-is-knowledge-management-in-health-insurance/', 200, 45800],
      ['/customers/', 200, 44500],
    ],
    insurance: [
      ['/what-is-knowledge-management-in-insurance/', 200, 45200],
      ['/customers/', 200, 44500],
      ['/case-studies/', 200, 34600],
    ],
    banking: [
      ['/solutions/financial-services/', 200, 43100],
      ['/products/retail-banking-suite/', 200, 43700],
      ['/what-is-knowledge-management-in-financial-services/', 200, 46600],
      ['/case-studies/global-bank-reduces-handle-time/', 200, 52800],
    ],
    telecom: [
      ['/solutions/telecom/', 200, 42700],
      ['/what-is-knowledge-management-in-telco/', 200, 44900],
      ['/case-studies/telecom-giant-nps-improvement/', 200, 49200],
    ],
  },
  // Bottom-of-funnel / decision
  bofu: [
    ['/pricing/', 200, 36700],
    ['/demo/', 200, 33200],
    ['/request-a-demo/', 200, 31500],
    ['/contact/', 200, 28400],
    ['/free-trial/', 200, 29100],
  ],
  // Careers — noise from job-seekers / competitors
  careers: [
    ['/careers/', 200, 38200],
    ['/careers/senior-software-engineer/', 200, 31400],
    ['/careers/product-manager-cx/', 200, 30200],
    ['/leadership/', 200, 34100],
  ],
  // WordPress static assets (many small hits per page view)
  assets: [
    ['/wp-content/themes/egain-2024/css/main.min.css', 200, 84600],
    ['/wp-content/themes/egain-2024/css/components.min.css', 200, 42300],
    ['/wp-content/themes/egain-2024/js/bundle.min.js', 200, 312400],
    ['/wp-content/themes/egain-2024/js/vendor.min.js', 200, 198700],
    ['/wp-content/uploads/2024/03/egain-logo.svg', 200, 8240],
    ['/wp-content/uploads/2024/05/hero-banner.webp', 200, 186400],
    ['/wp-content/plugins/elementor/assets/js/frontend.min.js', 200, 87300],
    ['/favicon.ico', 200, 4286],
    ['/wp-json/wp/v2/posts?per_page=3', 200, 12400],
    ['/sitemap.xml', 200, 18600],
    ['/robots.txt', 200, 642],
  ],
  // Attack surface / scanners — filterable noise
  attacks: [
    ['/wp-login.php', 403, 1892],
    ['/wp-login.php', 200, 4821],          // occasional successful probe response
    ['/xmlrpc.php', 403, 1024],
    ['/wp-admin/', 403, 2048],
    ['/wp-admin/admin-ajax.php', 403, 512],
    ['/.env', 404, 162],
    ['/admin/', 404, 1024],
    ['/phpmyadmin/', 404, 512],
    ['/.git/config', 404, 162],
    ['/config.php', 404, 162],
    ['/backup.zip', 404, 162],
    ['//wp-includes/wlwmanifest.xml', 200, 1024],
  ],
  // Generic 404s
  not_found: [
    ['/en/', 404, 842],
    ['/old-pricing/', 301, 0],
    ['/products/voice-bot/', 404, 6200],
    ['/wp-content/cache/minify/', 404, 320],
    ['/newsletter-unsubscribe/', 301, 0],
  ],
};

// ─── Data: user agents ────────────────────────────────────────────────────────

const UAS = {
  chrome_win: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  ],
  chrome_mac: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.122 Safari/537.36',
  ],
  firefox: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
  ],
  safari: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  ],
  edge: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  ],
  // Legitimate crawlers
  googlebot: [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36',
  ],
  bingbot: [
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ],
  seo_tools: [
    'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'DotBot/1.2 (https://opensiteexplorer.org/dotbot; help@moz.com)',
    'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://moz.com/help/majestic)',
  ],
  // Bad bots / scanners
  scanners: [
    'zgrab/0.x',
    'Nuclei - Open-source project (github.com/projectdiscovery/nuclei)',
    'Mozilla/5.0 (compatible; NetcraftSurveyAgent/1.0)',
    'python-requests/2.31.0',
    'Go-http-client/1.1',
    'curl/8.4.0',
    'masscan/1.3 (https://github.com/robertdavidgraham/masscan)',
    'WPScan v3.8.25 (https://wpscan.com/wordpress-security-scanner)',
  ],
};

// ─── Data: referrers ─────────────────────────────────────────────────────────

const REFERRERS = {
  organic: [
    'https://www.google.com/',
    'https://www.google.com/search?q=best+customer+service+software',
    'https://www.google.com/search?q=knowledge+management+software+enterprise',
    'https://www.google.com/search?q=egain+pricing',
    'https://www.bing.com/search?q=contact+center+AI+platform',
  ],
  social: [
    'https://www.linkedin.com/',
    'https://lnkd.in/',
    'https://t.co/',
  ],
  referral: [
    'https://www.gartner.com/reviews/market/crm-customer-engagement-center',
    'https://www.g2.com/products/egain/reviews',
    'https://www.capterra.com/p/58636/eGain/',
    'https://sourceforge.net/software/product/eGain/',
  ],
  internal: ['https://www.egain.com/'],
  none: ['-'],
};

// ─── Generic IP generator ─────────────────────────────────────────────────────
// Generates plausible public IPs, avoiding RFC-1918 / special ranges.

const IP_OCTET_RANGES = [
  [1, 9], [11, 100], [102, 126], [128, 172],
  [173, 191], [193, 223],
];

function randomPublicIP() {
  const ranges = IP_OCTET_RANGES;
  const [lo, hi] = choice(ranges);
  return `${randInt(lo, hi)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

// ─── Timestamp formatting ─────────────────────────────────────────────────────

function fmtNginxDate(ts) {
  // Nginx timestamps record local clock time with the timezone offset appended.
  // Apply the offset to convert from UTC to local before formatting.
  const d = new Date(ts + TZ_OFFSET_MS);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${months[d.getUTCMonth()]}/${d.getUTCFullYear()}:${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${TZ_OFFSET}`;
}

function fmtRunDir(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ─── Log entry building ───────────────────────────────────────────────────────

function buildLogLine(ip, ts, method, urlPath, status, bytes, referer, ua) {
  const timestamp = fmtNginxDate(ts);
  const safeRef   = referer.includes('"') ? referer.replace(/"/g, "'") : referer;
  const safeUA    = ua.includes('"') ? ua.replace(/"/g, "'") : ua;
  return `${ip} - - [${timestamp}] "${method} ${urlPath} HTTP/1.1" ${status} ${bytes} "${safeRef}" "${safeUA}"`;
}

// ─── Traffic pattern: time-of-day weight ──────────────────────────────────────
// Returns a multiplier [0,1] for a given UTC hour.
// Business-hours peak centred around ~15:00 UTC (8am PST / 11am EST).

function hourWeight(utcHour) {
  // Two humps: US morning and EU/US afternoon overlap
  const us = Math.exp(-0.5 * Math.pow((utcHour - 15) / 3.5, 2));
  const eu = Math.exp(-0.5 * Math.pow((utcHour - 10) / 2.5, 2)) * 0.4;
  const night = 0.04;
  return Math.max(night, us + eu);
}

function dayWeight(dayOfWeek) {
  // 0=Sun, 6=Sat
  return [0.35, 1.0, 1.0, 0.95, 0.9, 0.7, 0.3][dayOfWeek];
}

// ─── Per-visitor roles ────────────────────────────────────────────────────────
// Each IP in a company has a behavioural persona that determines which pages
// they visit and how deep they go. This prevents every visitor looking identical
// and makes the hot-lead signal more believable (one IP reads blogs, another
// compares products, one eventually hits pricing).

const VISITOR_ROLES = {
  kaiser:      { '162.119.232.100': 'decider',    '162.119.17.100':  'evaluator',  '198.140.10.100':  'researcher', '162.119.80.100':  'evaluator',  '162.119.160.100': 'researcher' },
  cigna:       { '170.48.10.100':   'researcher', '170.48.64.100':   'evaluator',  '162.20.100.100':  'researcher', '170.48.120.100':  'researcher', '170.48.200.100':  'casual'     },
  aetna:       { '152.145.224.100': 'evaluator',  '152.145.10.100':  'researcher', '152.145.200.100': 'evaluator',  '152.145.80.100':  'researcher', '152.145.160.100': 'casual'     },
  progressive: { '170.218.100.100': 'evaluator',  '170.218.50.50':   'researcher', '170.218.200.100': 'decider',    '170.218.25.100':  'evaluator',  '170.218.150.100': 'researcher' },
  pnc:         { '161.150.193.15':  'researcher', '161.150.80.100':  'researcher', '170.201.64.100':  'casual',     '161.150.120.100': 'researcher', '170.201.160.100': 'casual'     },
  spectrum:    { '71.44.80.100':    'casual',     '107.14.120.100':  'casual',     '69.134.189.100':  'researcher', '71.44.90.100':    'casual',     '71.44.70.100':    'casual'     },
  xfinity:     { '73.142.51.8':     'careers',    '96.112.47.15':    'careers',    '96.112.237.100':  'careers',    '73.50.100.100':   'careers',    '96.113.100.100':  'careers'    },
};

const COMPANY_CONTENT_FIT = {
  kaiser: 'healthcare',
  cigna: 'health_insurance',
  aetna: 'health_insurance',
  progressive: 'insurance',
  pnc: 'banking',
  spectrum: 'telecom',
  xfinity: 'telecom',
};

function companyPagePool(company, cluster) {
  if (cluster !== 'mofu') return PAGES[cluster];

  const industryKey = COMPANY_CONTENT_FIT[company.id];
  const industryPages = PAGES.industry_mofu[industryKey] || [];
  if (!industryPages.length) return PAGES.mofu;

  const generalPages = PAGES.mofu;
  const pool = weightedChoice([
    { v: industryPages, w: 62 },
    { v: generalPages, w: 38 },
  ]).v;

  return pool.length ? pool : generalPages;
}

// Returns the page pool key for a visitor given their role, company arc, and
// how far through their own session history they are (0 = first visit, 1 = last).
function visitorPagePool(role, arc, progress) {
  if (role === 'careers') return 'careers';

  if (role === 'casual') return rand() < 0.85 ? 'tofu' : 'mofu';

  if (role === 'researcher') {
    if (arc === 'early_funnel' || arc === 'lurker') return 'tofu';
    return rand() < 0.65 ? 'tofu' : 'mofu';
  }

  if (role === 'evaluator') {
    if (arc === 'late_surge') {
      // Quiet start; bofu only in the last 35% of their visit history
      if (progress < 0.65) return rand() < 0.55 ? 'tofu' : 'mofu';
      return rand() < 0.35 ? 'mofu' : 'bofu';
    }
    if (arc === 'steady_researcher') {
      return progress < 0.5 ? 'mofu' : (rand() < 0.65 ? 'mofu' : 'bofu');
    }
    // hot_lead / multi_user: ramps to bofu
    if (progress < 0.35) return 'mofu';
    if (progress < 0.65) return rand() < 0.45 ? 'mofu' : 'bofu';
    return rand() < 0.2 ? 'mofu' : 'bofu';
  }

  if (role === 'decider') {
    // Skips most research — goes straight to evaluation pages
    if (progress < 0.2) return 'mofu';
    return rand() < 0.12 ? 'mofu' : 'bofu';
  }

  return 'tofu';
}

// Returns a realistic page count for a session based on visitor role.
// Adds genuine bounces and short sessions, which the old randInt(2,6) didn't do.
function sessionPageCount(role) {
  const r = rand();
  if (role === 'casual')     return r < 0.38 ? 1 : r < 0.70 ? 2 : r < 0.90 ? 3 : 4;
  if (role === 'decider')    return r < 0.22 ? 1 : r < 0.52 ? 2 : r < 0.77 ? 3 : r < 0.92 ? 4 : 5;
  if (role === 'researcher') return r < 0.12 ? 1 : r < 0.35 ? 2 : r < 0.60 ? 3 : r < 0.80 ? 4 : r < 0.93 ? 5 : 6;
  /* evaluator */            return r < 0.18 ? 1 : r < 0.45 ? 2 : r < 0.68 ? 3 : r < 0.85 ? 4 : r < 0.95 ? 5 : 6;
}

// ─── Session builder: one company visit = multiple HTTP requests ──────────────

function buildCompanySession(company, ip, role, visitTs, ipIdx, ipTotal) {
  const ua = weightedChoice([
    { v: choice(UAS.chrome_win),  w: 40 },
    { v: choice(UAS.chrome_mac),  w: 30 },
    { v: choice(UAS.firefox),     w: 15 },
    { v: choice(UAS.edge),        w: 10 },
    { v: choice(UAS.safari),      w: 5  },
  ]).v;

  const refSrc = weightedChoice([
    { v: 'organic',  w: 45 },
    { v: 'social',   w: 30 },
    { v: 'referral', w: 15 },
    { v: 'none',     w: 10 },
  ]).v;
  const referer = choice(REFERRERS[refSrc]);

  // Progress is per-visitor (this IP's session index within its own history)
  const progress = ipTotal > 1 ? ipIdx / (ipTotal - 1) : 0.5;
  const cluster  = visitorPagePool(role, company.arc, progress);
  const pagePool = companyPagePool(company, cluster);

  const numPages = sessionPageCount(role);
  const entries  = [];
  let   sessionTs = visitTs;

  for (let p = 0; p < numPages; p++) {
    const [urlPath, status, bytes] = choice(pagePool);
    entries.push(buildLogLine(ip, sessionTs, 'GET', urlPath, status, bytes + randInt(-200, 200), referer, ua));

    const assetCount = randInt(3, 7);
    for (let a = 0; a < assetCount; a++) {
      sessionTs += randInt(50, 600);
      const [assetPath, assetStatus, assetBytes] = choice(PAGES.assets);
      const assetRef    = `https://www.egain.com${urlPath}`;
      const finalStatus = rand() < 0.3 ? 304 : assetStatus;
      const finalBytes  = finalStatus === 304 ? 0 : assetBytes + randInt(-500, 500);
      entries.push(buildLogLine(ip, sessionTs, 'GET', assetPath, finalStatus, finalBytes, assetRef, ua));
      sessionTs += randInt(20, 200);
    }

    sessionTs += randInt(15000, 180000); // 15s–3min between pages
  }
  return entries;
}

// ─── Generic visitor session ──────────────────────────────────────────────────

function buildGenericSession(ts) {
  const ip      = randomPublicIP();
  const ua      = weightedChoice([
    { v: choice(UAS.chrome_win),  w: 38 },
    { v: choice(UAS.chrome_mac),  w: 22 },
    { v: choice(UAS.firefox),     w: 16 },
    { v: choice(UAS.safari),      w: 14 },
    { v: choice(UAS.edge),        w: 10 },
  ]).v;

  const refSrc  = weightedChoice([
    { v: 'organic',  w: 55 },
    { v: 'none',     w: 25 },
    { v: 'social',   w: 12 },
    { v: 'referral', w: 8  },
  ]).v;
  const referer = choice(REFERRERS[refSrc]);

  const cluster = weightedChoice([
    { v: 'tofu',   w: 50 },
    { v: 'mofu',   w: 30 },
    { v: 'bofu',   w: 10 },
    { v: 'careers', w: 10 },
  ]).v;

  const numPages = randInt(1, 4);
  const entries  = [];
  let   sessionTs = ts;

  for (let p = 0; p < numPages; p++) {
    const [urlPath, status, bytes] = choice(PAGES[cluster]);
    entries.push(buildLogLine(ip, sessionTs, 'GET', urlPath, status, bytes + randInt(-300, 300), referer, ua));

    const assetCount = randInt(2, 5);
    for (let a = 0; a < assetCount; a++) {
      sessionTs += randInt(50, 800);
      const [ap, as_, ab] = choice(PAGES.assets);
      const finalStatus   = rand() < 0.3 ? 304 : as_;
      entries.push(buildLogLine(ip, sessionTs, 'GET', ap, finalStatus, finalStatus === 304 ? 0 : ab, `https://www.egain.com${urlPath}`, ua));
    }
    sessionTs += randInt(10000, 120000);
  }
  return entries;
}

// ─── Bot sessions ─────────────────────────────────────────────────────────────

function buildBotSession(ts, botType) {
  const ip = randomPublicIP();
  const entries = [];

  if (botType === 'search') {
    const ua  = choice([...UAS.googlebot, ...UAS.bingbot]);
    const num = randInt(3, 12);
    const crawlable = [...PAGES.tofu, ...PAGES.mofu, ...PAGES.assets.slice(0,4)];
    let   t = ts;
    for (let i = 0; i < num; i++) {
      const [urlPath, status, bytes] = choice(crawlable);
      entries.push(buildLogLine(ip, t, 'GET', urlPath, status, bytes, '-', ua));
      t += randInt(800, 4000);
    }
  } else if (botType === 'seo') {
    const ua  = choice(UAS.seo_tools);
    const all = [...PAGES.tofu, ...PAGES.mofu, ...PAGES.bofu];
    let   t = ts;
    for (let i = 0; i < randInt(5, 20); i++) {
      const [urlPath, , bytes] = choice(all);
      entries.push(buildLogLine(ip, t, 'GET', urlPath, 200, bytes, '-', ua));
      t += randInt(200, 1200);
    }
  } else if (botType === 'scanner') {
    const ua  = choice(UAS.scanners);
    const num = randInt(2, 8);
    let   t = ts;
    for (let i = 0; i < num; i++) {
      const [urlPath, status, bytes] = choice(PAGES.attacks);
      entries.push(buildLogLine(ip, t, 'POST', urlPath, status, bytes, '-', ua));
      t += randInt(100, 600);
    }
  }
  return entries;
}

// ─── Main generation ──────────────────────────────────────────────────────────

function generateLogs() {
  const tf      = parseTimeframe(config.timeframe);
  const rate    = parseInt(config.rate, 10) || 1000;
  const now     = Date.now();
  const startTs = now - tf.totalMs;

  // Total "sessions" to generate (sessions, not raw log lines)
  // We treat `rate` as human sessions per unit (week/day/hour).
  const totalSessions = Math.round(rate * tf.val);

  console.log(`\nGenerating logs:`);
  console.log(`  Timeframe   : ${config.timeframe}  (${new Date(startTs).toISOString()} → now)`);
  console.log(`  Rate        : ${rate} sessions/${tf.unit}`);
  console.log(`  Total sessions: ~${totalSessions}`);

  // ── Schedule company visits across the timeframe ──────────────────────────
  //
  // Each company has a fixed sessionBudget. Visits are distributed per-IP using
  // round-robin so each visitor gets a proportional share. Per-IP sessions are
  // then spaced at least 4 hours apart to prevent the same user appearing to hit
  // the pricing page multiple times in minutes.

  const MIN_IP_GAP_MS = 4 * 3600 * 1000; // 4 hours between same-IP visits
  const genericSessions = totalSessions;   // all generic sessions (no company ratio)

  const allEntries = []; // { ts, lines[] }

  // Company visits
  for (const company of COMPANY_PROFILES) {
    const numVisits = company.sessionBudget;

    // 1. Generate arc-appropriate time fractions for all visits
    const rawFractions = [];
    for (let i = 0; i < numVisits; i++) {
      let fraction;
      if (company.arc === 'late_surge') {
        // 60% of visits land in the final 45% of the window (believable surge,
        // not synthetic-looking). Keeps trend under ~150% vs prior week.
        fraction = rand() < 0.60 ? (0.55 + rand() * 0.45) : rand() * 0.55;
      } else if (company.arc === 'hot_lead') {
        fraction = Math.pow(rand(), 0.75); // slight early-skew then ramps
      } else {
        fraction = rand();
      }
      rawFractions.push(fraction);
    }
    rawFractions.sort((a, b) => a - b);

    // 2. Assign IPs round-robin across sorted visits (even distribution)
    const ipAssignments = rawFractions.map((fraction, idx) => ({
      fraction,
      ip: company.ips[idx % company.ips.length],
    }));

    // 3. Convert fractions to timestamps, snap to working hours
    const ipTimestamps = {}; // ip → [ts, ...]
    for (const ip of company.ips) ipTimestamps[ip] = [];

    for (const { fraction, ip } of ipAssignments) {
      let visitMs = startTs + fraction * tf.totalMs;
      const targetHour  = company.peakHourUTC + randInt(-2, 2);
      const currentHour = new Date(visitMs).getUTCHours();
      visitMs += (targetHour - currentHour) * 3600000 + randInt(-1800000, 1800000);
      visitMs  = Math.max(startTs, Math.min(now - 1000, visitMs));
      ipTimestamps[ip].push(visitMs);
    }

    // 4. Enforce minimum 4h gap per IP (push conflicting visits forward)
    for (const ip of company.ips) {
      const times = ipTimestamps[ip].sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i - 1] < MIN_IP_GAP_MS) {
          times[i] = times[i - 1] + MIN_IP_GAP_MS + randInt(0, 30 * 60000);
          times[i] = Math.min(times[i], now - 1000);
        }
      }
    }

    // 5. Build sessions — progress is per-IP so each visitor's arc is independent
    for (const ip of company.ips) {
      const role  = (VISITOR_ROLES[company.id] || {})[ip] || 'researcher';
      const times = ipTimestamps[ip];
      times.forEach((visitTs, ipIdx) => {
        const lines = buildCompanySession(company, ip, role, visitTs, ipIdx, times.length);
        allEntries.push({ ts: visitTs, lines });
      });
    }
  }

  // Generic human sessions
  for (let i = 0; i < genericSessions; i++) {
    // Pick a random timestamp weighted by hour and day
    let attempts = 0;
    let ts;
    do {
      const fraction = rand();
      ts = startTs + fraction * tf.totalMs;
      const d = new Date(ts);
      const hw = hourWeight(d.getUTCHours());
      const dw = dayWeight(d.getUTCDay());
      if (rand() < hw * dw) break;
      attempts++;
    } while (attempts < 20);

    const sessionType = weightedChoice([
      { v: 'human',   w: 60 },
      { v: 'search',  w: 18 },
      { v: 'seo',     w: 12 },
      { v: 'scanner', w: 10 },
    ]).v;

    let lines;
    if (sessionType === 'human') {
      lines = buildGenericSession(ts);
    } else {
      lines = buildBotSession(ts, sessionType);
    }
    allEntries.push({ ts, lines });
  }

  // ── Flatten and sort all lines by timestamp ───────────────────────────────

  const flatLines = allEntries
    .flatMap(e => e.lines.map(l => ({ ts: e.ts, line: l })))
    .sort((a, b) => a.ts - b.ts);

  // ── Group by calendar day (UTC) ───────────────────────────────────────────

  const byDay = new Map();
  for (const { line, ts } of flatLines) {
    const d   = new Date(ts);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(line);
  }

  const days = [...byDay.keys()].sort(); // ascending: oldest first
  const totalDays = days.length;
  console.log(`  Days covered: ${totalDays}  (${days[0]} → ${days[days.length - 1]})`);
  console.log(`  Total log lines: ${flatLines.length.toLocaleString()}`);

  // ── Create output directory (fixed path, wipe on each run) ──────────────────

  const logsRoot = path.join(__dirname, 'logs');
  fs.mkdirSync(logsRoot, { recursive: true });

  // Remove any previous log files so the directory stays clean.
  for (const f of fs.readdirSync(logsRoot)) {
    if (f.startsWith('access.log') || f === 'error.log') {
      fs.rmSync(path.join(logsRoot, f), { force: true });
    }
  }

  // ── Write files with nginx logrotate naming convention ────────────────────
  //
  // Nginx logrotate (with delaycompress) produces:
  //   access.log        → today's partial log (still being written)
  //   access.log.1      → yesterday's complete log (not yet compressed)
  //   access.log.2.gz   → 2 days ago (compressed)
  //   access.log.N.gz   → N days ago (compressed)
  //
  // We reverse the sorted days array: index 0 = today, 1 = yesterday, etc.

  const reversedDays = [...days].reverse(); // most recent first

  const writtenFiles = [];

  for (let i = 0; i < reversedDays.length; i++) {
    const day   = reversedDays[i];
    const lines = byDay.get(day).join('\n') + '\n';

    if (i === 0) {
      // Most recent day → access.log (still "open")
      const filePath = path.join(logsRoot, 'access.log');
      fs.writeFileSync(filePath, lines, 'utf8');
      writtenFiles.push({ name: 'access.log', day, lines: byDay.get(day).length, compressed: false });
    } else if (i === 1) {
      // Previous day → access.log.1 (rotated but not yet compressed due to delaycompress)
      const filePath = path.join(logsRoot, 'access.log.1');
      fs.writeFileSync(filePath, lines, 'utf8');
      writtenFiles.push({ name: 'access.log.1', day, lines: byDay.get(day).length, compressed: false });
    } else {
      // Older → access.log.N.gz (compressed)
      const fileName = `access.log.${i}.gz`;
      const filePath = path.join(logsRoot, fileName);
      const gz       = zlib.gzipSync(Buffer.from(lines, 'utf8'), { level: 6 });
      fs.writeFileSync(filePath, gz);
      writtenFiles.push({ name: fileName, day, lines: byDay.get(day).length, compressed: true });
    }
  }

  // ── Write error.log (4xx/5xx entries re-formatted as nginx error log) ─────

  const errorLines = flatLines
    .filter(({ line }) => {
      const m = line.match(/"[A-Z]+ \S+ HTTP\/[\d.]+" (\d{3})/);
      return m && parseInt(m[1]) >= 400;
    })
    .map(({ line, ts }) => {
      const d      = new Date(ts);
      const pad    = n => String(n).padStart(2, '0');
      const stamp  = `${d.getUTCFullYear()}/${pad(d.getUTCMonth()+1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      const ipM    = line.match(/^([\d.]+)/);
      const reqM   = line.match(/"([^"]+)"/);
      const stM    = line.match(/"[^"]+" (\d{3})/);
      const ip     = ipM ? ipM[1] : '-';
      const req    = reqM ? reqM[1] : '-';
      const status = stM ? stM[1] : '-';
      const level  = status.startsWith('5') ? 'error' : 'warn';
      const pid    = 12345 + randInt(0, 5);
      return `${stamp} [${level}] ${pid}#${pid}: *${randInt(1000,99999)} access forbidden by rule, client: ${ip}, server: egain.com, request: "${req}", host: "www.egain.com"`;
    });

  fs.writeFileSync(path.join(logsRoot, 'error.log'), errorLines.join('\n') + '\n', 'utf8');

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\nOutput: ${logsRoot}/`);
  console.log('');
  console.log('Files:');
  const nameW = Math.max(...writtenFiles.map(f => f.name.length));
  for (const f of writtenFiles) {
    const stat = fs.statSync(path.join(logsRoot, f.name));
    const size = (stat.size / 1024).toFixed(1).padStart(8);
    const gz   = f.compressed ? ' (gz)' : '     ';
    console.log(`  ${f.name.padEnd(nameW)}  ${f.day}  ${String(f.lines).padStart(6)} lines  ${size} KB${gz}`);
  }
  console.log(`  ${'error.log'.padEnd(nameW)}               ${String(errorLines.length).padStart(6)} lines`);
  console.log('');
  console.log('Company traffic summary:');
  for (const company of COMPANY_PROFILES) {
    const hits = flatLines.filter(({ line }) => company.ips.some(ip => line.startsWith(ip))).length;
    if (hits > 0) {
      console.log(`  [${company.arc.padEnd(18)}]  ${String(hits).padStart(5)} hits  ${company.name}  (${company.industry})`);
    }
  }
  console.log('');
}

generateLogs();
