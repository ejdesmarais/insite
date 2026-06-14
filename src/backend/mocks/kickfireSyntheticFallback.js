'use strict';

const { findSyntheticProfileByIp } = require('./syntheticProfiles');

const PROVIDER = 'kickfire';

function normalizeWebsite(value) {
  if (!value) return null;
  let website = String(value).trim().toLowerCase();
  if (!website) return null;
  website = website.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  website = website.replace(/^www\./i, '');
  website = website.split(/[/?#]/)[0];
  return website || null;
}

function syntheticFallbackResult(ip) {
  const profile = findSyntheticProfileByIp(ip);
  const now = new Date().toISOString();

  if (!profile) {
    return {
      ip,
      provider: `${PROVIDER}-fallback`,
      status: 'unresolved',
      confidenceLabel: 'low',
      reason: 'No KickFire API key is configured, and the IP is not part of the built-in synthetic demo map.',
      company: null,
      ipLookup: {
        provider: `${PROVIDER}-fallback`,
        kind: 'ip_lookup',
        found: false,
        providerStatus: 'fallback',
        result: null,
        reason: 'missing_api_key',
        record: null,
        company: null,
        raw: null,
      },
      companyProfile: null,
      cache: { hit: false, enrichedAt: now },
    };
  }

  const company = {
    name: profile.name,
    tradeName: null,
    website: normalizeWebsite(profile.domain),
    location: {
      street: null,
      city: profile.hq.split(',')[0] || null,
      regionShort: profile.hq.split(',')[1]?.trim() || null,
      region: null,
      postal: null,
      countryShort: 'US',
      country: 'United States',
      latitude: null,
      longitude: null,
      timeZoneId: null,
      timeZoneName: null,
      utcOffset: null,
    },
    contact: {
      phone: null,
      facebook: null,
      twitter: null,
      linkedIn: null,
    },
    firmographics: {
      employees: profile.employees,
      revenue: profile.revenue,
      sicGroup: null,
      sicDesc: null,
      sicCode: null,
      naicsGroup: profile.industry,
      naicsDesc: profile.industry,
      naicsCode: null,
      stockSymbol: null,
    },
  };

  return {
    ip,
    provider: `${PROVIDER}-fallback`,
    status: 'resolved',
    confidenceLabel: 'high',
    reason: 'No KickFire API key is configured; resolved from the built-in synthetic demo IP map.',
    company,
    ipLookup: {
      provider: `${PROVIDER}-fallback`,
      kind: 'ip_lookup',
      found: true,
      providerStatus: 'fallback',
      result: null,
      reason: 'synthetic_demo_match',
      record: {
        companyName: profile.name,
        tradeName: null,
        website: normalizeWebsite(profile.domain),
        confidence: 100,
        timeZoneId: null,
        timeZoneName: null,
        utcOffset: null,
        isISP: false,
        isWifi: false,
        isMobile: false,
      },
      company,
      raw: null,
    },
    companyProfile: null,
    cache: { hit: false, enrichedAt: now },
  };
}

module.exports = { syntheticFallbackResult };
