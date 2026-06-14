'use strict';

const SYNTHETIC_PROFILES = [
  {
    id: 'kaiser', name: 'Kaiser Permanente', domain: 'kaiserpermanente.org',
    industry: 'Healthcare', employees: '305,000', revenue: '$104B', hq: 'Oakland, CA',
    fit_score: 95, initials: 'KP', color: 'bg-blue-700',
    ips: ['162.119.232.100', '162.119.17.100', '198.140.10.100', '162.119.80.100', '162.119.160.100'],
  },
  {
    id: 'cigna', name: 'Cigna', domain: 'cigna.com',
    industry: 'Health Insurance', employees: '74,000', revenue: '$195B', hq: 'Bloomfield, CT',
    fit_score: 90, initials: 'CI', color: 'bg-indigo-600',
    ips: ['170.48.10.100', '170.48.64.100', '162.20.100.100', '170.48.120.100', '170.48.200.100'],
  },
  {
    id: 'aetna', name: 'Aetna', domain: 'aetna.com',
    industry: 'Health Insurance', employees: '57,000', revenue: '$92B', hq: 'Hartford, CT',
    fit_score: 88, initials: 'AE', color: 'bg-sky-700',
    ips: ['152.145.224.100', '152.145.10.100', '152.145.200.100', '152.145.80.100', '152.145.160.100'],
  },
  {
    id: 'progressive', name: 'Progressive', domain: 'progressive.com',
    industry: 'Insurance', employees: '58,000', revenue: '$66B', hq: 'Mayfield Village, OH',
    fit_score: 82, initials: 'PR', color: 'bg-blue-600',
    ips: ['170.218.100.100', '170.218.50.50', '170.218.200.100', '170.218.25.100', '170.218.150.100'],
  },
  {
    id: 'pnc', name: 'PNC', domain: 'pnc.com',
    industry: 'Banking', employees: '57,000', revenue: '$22B', hq: 'Pittsburgh, PA',
    fit_score: 80, initials: 'PN', color: 'bg-orange-600',
    ips: ['161.150.193.15', '161.150.80.100', '170.201.64.100', '161.150.120.100', '170.201.160.100'],
  },
  {
    id: 'spectrum', name: 'Spectrum', domain: 'spectrum.com',
    industry: 'Telecommunications', employees: '101,000', revenue: '$54B', hq: 'Stamford, CT',
    fit_score: 78, initials: 'SP', color: 'bg-violet-600',
    ips: ['71.44.80.100', '107.14.120.100', '69.134.189.100', '71.44.90.100', '71.44.70.100'],
  },
  {
    id: 'xfinity', name: 'Xfinity / Comcast', domain: 'comcast.com',
    industry: 'Telecommunications', employees: '190,000', revenue: '$121B', hq: 'Philadelphia, PA',
    fit_score: 55, initials: 'XF', color: 'bg-slate-500',
    ips: ['73.142.51.8', '96.112.47.15', '96.112.237.100', '73.50.100.100', '96.113.100.100'],
  },
];

const SYNTHETIC_IP_MAP = {};
for (const profile of SYNTHETIC_PROFILES) {
  for (const ip of profile.ips) SYNTHETIC_IP_MAP[ip] = profile;
}

function findSyntheticProfileByIp(ip) {
  return SYNTHETIC_IP_MAP[ip] || null;
}

function findSyntheticProfileByDomain(domain) {
  return SYNTHETIC_PROFILES.find(profile => profile.domain === domain) || null;
}

module.exports = {
  SYNTHETIC_PROFILES,
  findSyntheticProfileByIp,
  findSyntheticProfileByDomain,
};
