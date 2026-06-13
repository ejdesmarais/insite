'use strict';

const SYNTHETIC_PROFILES = [
  {
    id: 'kaiser', name: 'Kaiser Permanente', domain: 'kaiserpermanente.org',
    industry: 'Healthcare', employees: '305,000', revenue: '$104B', hq: 'Oakland, CA',
    icp_score: 95, initials: 'KP', color: 'bg-blue-700',
    ips: ['162.119.232.100', '162.119.17.100', '198.140.10.100', '162.119.80.100', '162.119.160.100'],
  },
  {
    id: 'cigna', name: 'Cigna', domain: 'cigna.com',
    industry: 'Health Insurance', employees: '74,000', revenue: '$195B', hq: 'Bloomfield, CT',
    icp_score: 90, initials: 'CI', color: 'bg-indigo-600',
    ips: ['170.48.10.100', '170.48.64.100', '162.20.100.100', '170.48.120.100', '170.48.200.100'],
  },
  {
    id: 'aetna', name: 'Aetna', domain: 'aetna.com',
    industry: 'Health Insurance', employees: '57,000', revenue: '$92B', hq: 'Hartford, CT',
    icp_score: 88, initials: 'AE', color: 'bg-sky-700',
    ips: ['152.145.224.100', '152.145.10.100', '152.145.200.100', '152.145.80.100', '152.145.160.100'],
  },
  {
    id: 'progressive', name: 'Progressive', domain: 'progressive.com',
    industry: 'Insurance', employees: '58,000', revenue: '$66B', hq: 'Mayfield Village, OH',
    icp_score: 82, initials: 'PR', color: 'bg-blue-600',
    ips: ['170.218.100.100', '170.218.50.50', '170.218.200.100', '170.218.25.100', '170.218.150.100'],
  },
  {
    id: 'pnc', name: 'PNC', domain: 'pnc.com',
    industry: 'Banking', employees: '57,000', revenue: '$22B', hq: 'Pittsburgh, PA',
    icp_score: 80, initials: 'PN', color: 'bg-orange-600',
    ips: ['161.150.193.15', '161.150.80.100', '170.201.64.100', '161.150.120.100', '170.201.160.100'],
  },
  {
    id: 'spectrum', name: 'Spectrum', domain: 'spectrum.com',
    industry: 'Telecommunications', employees: '101,000', revenue: '$54B', hq: 'Stamford, CT',
    icp_score: 78, initials: 'SP', color: 'bg-violet-600',
    ips: ['71.44.80.100', '107.14.120.100', '69.134.189.100', '71.44.90.100', '71.44.70.100'],
  },
  {
    id: 'xfinity', name: 'Xfinity / Comcast', domain: 'comcast.com',
    industry: 'Telecommunications', employees: '190,000', revenue: '$121B', hq: 'Philadelphia, PA',
    icp_score: 55, initials: 'XF', color: 'bg-slate-500',
    ips: ['73.142.51.8', '96.112.47.15', '96.112.237.100', '73.50.100.100', '96.113.100.100'],
  },
];

const SYNTHETIC_IP_MAP = {};
for (const p of SYNTHETIC_PROFILES) {
  for (const ip of p.ips) SYNTHETIC_IP_MAP[ip] = p;
}

const COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-fuchsia-600', 'bg-indigo-600',
  'bg-orange-600', 'bg-sky-600', 'bg-slate-500',
];

function slugify(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unknown';
}

function initialsFor(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('') || '?';
}

function colorFor(id) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % COLORS.length;
  return COLORS[n];
}

function normalizeProfile(profile, source) {
  const id = profile.id || slugify(profile.domain || profile.name);
  return {
    id,
    name: profile.name || profile.domain || 'Unknown Organization',
    domain: profile.domain || null,
    industry: profile.industry || 'Unknown',
    employees: profile.employees || 'Unknown',
    revenue: profile.revenue || 'Unknown',
    hq: profile.hq || 'Unknown',
    icp_score: profile.icp_score ?? 50,
    initials: profile.initials || initialsFor(profile.name || profile.domain),
    color: profile.color || colorFor(id),
    enrichment_source: source,
  };
}

function formatHq(location = {}) {
  const cityRegion = [location.city, location.regionShort || location.region].filter(Boolean).join(', ');
  const country = location.countryShort || location.country;
  if (cityRegion && (!country || country === 'US' || country === 'United States')) return cityRegion;
  return [cityRegion, country].filter(Boolean).join(' ') || 'Unknown';
}

function createKickFireProvider() {
  return {
    name: 'kickfire',
    async resolveIp(ip) {
      const { resolveCompanyFromIpWithKickFire } = require('./services/kickfireService');
      const result = await resolveCompanyFromIpWithKickFire(ip);
      if (result.status !== 'resolved' || !result.company) return null;

      const company = result.company;
      const firmographics = company.firmographics || {};
      const confidence = result.ipLookup?.record?.confidence;
      const website = String(company.website || '').replace(/^www\./i, '').toLowerCase();
      const syntheticProfile = SYNTHETIC_PROFILES.find(profile => profile.domain === website);

      return normalizeProfile({
        id: syntheticProfile?.id || slugify(company.website || company.name),
        name: company.name || company.website,
        domain: company.website,
        industry: firmographics.naicsDesc || firmographics.sicDesc || firmographics.naicsGroup || firmographics.sicGroup || 'Unknown',
        employees: firmographics.employees || 'Unknown',
        revenue: firmographics.revenue || 'Unknown',
        hq: formatHq(company.location),
        icp_score: Number.isFinite(confidence) ? Math.round(confidence) : 60,
      }, 'kickfire');
    },
  };
}

function createMockProvider() {
  return {
    name: 'mock',
    async resolveIp(ip) {
      const profile = SYNTHETIC_IP_MAP[ip];
      return profile ? normalizeProfile(profile, 'mock') : null;
    },
  };
}

function createEnrichmentProvider() {
  const provider = (process.env.ENRICHMENT_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock' || provider === 'synthetic') return createMockProvider();
  if (provider === 'kickfire') return createKickFireProvider();
  throw new Error(`Unknown ENRICHMENT_PROVIDER "${provider}". Use "mock" or "kickfire".`);
}

module.exports = { createEnrichmentProvider, SYNTHETIC_PROFILES };
