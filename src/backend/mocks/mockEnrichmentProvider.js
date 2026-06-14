'use strict';

const { findSyntheticProfileByIp } = require('./syntheticProfiles');

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
    fit_score: profile.fit_score ?? 50,
    initials: profile.initials || initialsFor(profile.name || profile.domain),
    color: profile.color || colorFor(id),
    enrichment_source: source,
  };
}

function createMockEnrichmentProvider() {
  return {
    name: 'mock',
    async resolveIp(ip) {
      const profile = findSyntheticProfileByIp(ip);
      return profile ? normalizeProfile(profile, 'mock') : null;
    },
  };
}

module.exports = {
  createMockEnrichmentProvider,
  normalizeProfile,
  slugify,
};
