'use strict';

const { resolveCompanyFromIpWithKickFire } = require('./services/kickfireService');
const { findSyntheticProfileByDomain } = require('./mocks/syntheticProfiles');
const { createMockEnrichmentProvider, normalizeProfile, slugify } = require('./mocks/mockEnrichmentProvider');

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
      const result = await resolveCompanyFromIpWithKickFire(ip);
      if (result.status !== 'resolved' || !result.company) return null;

      const company = result.company;
      const firmographics = company.firmographics || {};
      const website = String(company.website || '').replace(/^www\./i, '').toLowerCase();
      const syntheticProfile = findSyntheticProfileByDomain(website);

      return normalizeProfile({
        id: syntheticProfile?.id || slugify(company.website || company.name),
        name: company.name || company.website,
        domain: company.website,
        industry: firmographics.naicsDesc || firmographics.sicDesc || firmographics.naicsGroup || firmographics.sicGroup || 'Unknown',
        employees: firmographics.employees || 'Unknown',
        revenue: firmographics.revenue || 'Unknown',
        hq: formatHq(company.location),
        fit_score: syntheticProfile?.fit_score || 60,
      }, 'kickfire');
    },
  };
}

function createEnrichmentProvider() {
  const provider = (process.env.ENRICHMENT_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock' || provider === 'synthetic') return createMockEnrichmentProvider();
  if (provider === 'kickfire') return createKickFireProvider();
  throw new Error(`Unknown ENRICHMENT_PROVIDER "${provider}". Use "mock" or "kickfire".`);
}

module.exports = { createEnrichmentProvider };
