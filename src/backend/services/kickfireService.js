'use strict';

const { dbGet, dbRun } = require('../db');
const { SYNTHETIC_PROFILES } = require('../enrichment');

const PROVIDER = 'kickfire';
const DEFAULT_BASE_URL = 'https://api.kickfire.com/v3';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function boolFromFlag(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return false;
}

function normalizeWebsite(value) {
  if (!value) return null;
  let website = String(value).trim().toLowerCase();
  if (!website) return null;
  website = website.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  website = website.replace(/^www\./i, '');
  website = website.split(/[/?#]/)[0];
  return website || null;
}

function normalizeKickFireCompany(record = {}) {
  const website = normalizeWebsite(record.website);
  return {
    name: record.companyName || record.tradeName || website || null,
    tradeName: record.tradeName || null,
    website,
    location: {
      street: record.street || null,
      city: record.city || null,
      regionShort: record.regionShort || null,
      region: record.region || null,
      postal: record.postal || null,
      countryShort: record.countryShort || null,
      country: record.country || null,
      latitude: record.latitude || null,
      longitude: record.longitude || null,
      timeZoneId: record.timeZoneId || null,
      timeZoneName: record.timeZoneName || null,
      utcOffset: record.utcOffset || null,
    },
    contact: {
      phone: record.phone || null,
      facebook: record.facebook || null,
      twitter: record.twitter || null,
      linkedIn: record.linkedIn || null,
    },
    firmographics: {
      employees: record.employees || null,
      revenue: record.revenue || null,
      sicGroup: record.sicGroup || null,
      sicDesc: record.sicDesc || null,
      sicCode: record.sicCode || null,
      naicsGroup: record.naicsGroup || null,
      naicsDesc: record.naicsDesc || null,
      naicsCode: record.naicsCode || null,
      stockSymbol: record.stockSymbol || null,
    },
  };
}

function normalizeLookupRecord(record = {}) {
  return {
    companyName: record.companyName || null,
    tradeName: record.tradeName || null,
    website: normalizeWebsite(record.website),
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : null,
    timeZoneId: record.timeZoneId || null,
    timeZoneName: record.timeZoneName || null,
    utcOffset: record.utcOffset || null,
    isISP: boolFromFlag(record.isISP),
    isWifi: boolFromFlag(record.isWifi),
    isMobile: boolFromFlag(record.isMobile),
  };
}

function mergeCompany(ipLookup, companyProfile) {
  const ipRecord = ipLookup?.record || {};
  const profileRecord = companyProfile?.record || {};
  const merged = { ...ipRecord, ...profileRecord };
  const company = normalizeKickFireCompany(merged);

  company.name = company.name || ipRecord.companyName || ipRecord.tradeName || ipRecord.website || null;
  company.tradeName = company.tradeName || ipRecord.tradeName || null;
  company.website = company.website || ipRecord.website || null;
  company.location.timeZoneId = company.location.timeZoneId || ipRecord.timeZoneId || null;
  company.location.timeZoneName = company.location.timeZoneName || ipRecord.timeZoneName || null;
  company.location.utcOffset = company.location.utcOffset || ipRecord.utcOffset || null;

  return company;
}

function getConfig() {
  const key = process.env.KICKFIRE_API_KEY;
  if (!key) {
    const err = new Error('KICKFIRE_API_KEY is required for KickFire enrichment.');
    err.code = 'missing_kickfire_api_key';
    throw err;
  }

  return {
    key,
    baseUrl: (process.env.KICKFIRE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
}

function findSyntheticProfileByIp(ip) {
  return SYNTHETIC_PROFILES.find(profile => profile.ips.includes(ip)) || null;
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

async function fetchKickFire(endpoint, params) {
  const { key, baseUrl } = getConfig();
  const url = new URL(`${baseUrl}/${endpoint.replace(/^\/+/, '')}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, value);
  }
  url.searchParams.set('key', key);

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    const parseErr = new Error(`KickFire returned non-JSON response: HTTP ${response.status}`);
    parseErr.code = 'kickfire_non_json';
    parseErr.status = response.status;
    throw parseErr;
  }

  if (!response.ok) {
    const err = new Error(`KickFire request failed: HTTP ${response.status}`);
    err.code = 'kickfire_http_error';
    err.status = response.status;
    err.raw = json;
    throw err;
  }

  return json;
}

function normalizeKickFireEnvelope(raw, kind) {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  const record = data[0] || null;

  return {
    provider: PROVIDER,
    kind,
    found: raw?.status === 'success' && data.length > 0 && !!record,
    providerStatus: raw?.status || null,
    result: raw?.result ?? null,
    reason: raw?.status !== 'success'
      ? 'provider_status_not_success'
      : data.length === 0
        ? 'empty_data'
        : 'match_found',
    record: record ? normalizeLookupRecord(record) : null,
    company: record ? normalizeKickFireCompany(record) : null,
    raw,
  };
}

async function lookupKickFireCompanyByIp(ip) {
  const raw = await fetchKickFire('company', { ip });
  return normalizeKickFireEnvelope(raw, 'ip_lookup');
}

async function lookupKickFireCompanyByWebsite(website) {
  const normalizedWebsite = normalizeWebsite(website);
  if (!normalizedWebsite) {
    return {
      provider: PROVIDER,
      kind: 'company_profile',
      found: false,
      providerStatus: null,
      result: null,
      reason: 'missing_website',
      record: null,
      company: null,
      raw: null,
    };
  }

  const raw = await fetchKickFire('company:(all)', { website: normalizedWebsite });
  return normalizeKickFireEnvelope(raw, 'company_profile');
}

function classify(ipLookup, companyProfile) {
  if (!ipLookup?.found) {
    return {
      status: 'unresolved',
      confidenceLabel: 'low',
      reason: 'No company match returned for this IP address.',
    };
  }

  const record = ipLookup.record || {};
  if (record.isISP || record.isWifi || record.isMobile) {
    return {
      status: 'weak_match',
      confidenceLabel: 'low',
      reason: 'The IP resolved to ISP, Wi-Fi, or mobile traffic, so company attribution is weak.',
    };
  }

  const confidence = record.confidence ?? 0;
  if (confidence >= 85 && companyProfile?.found) {
    return {
      status: 'resolved',
      confidenceLabel: 'high',
      reason: 'High-confidence IP match with firmographic company enrichment.',
    };
  }

  if (confidence >= 50) {
    return {
      status: 'resolved',
      confidenceLabel: 'medium',
      reason: 'Moderate-confidence IP match; firmographic enrichment may be partial or unavailable.',
    };
  }

  return {
    status: 'weak_match',
    confidenceLabel: 'low',
    reason: 'KickFire returned a low-confidence company match.',
  };
}

function readCachedResult(ip) {
  const row = dbGet('SELECT raw_json, enriched_at FROM ip_enrichment_cache WHERE ip = ?', [ip]);
  if (!row) return null;

  const enrichedAt = Date.parse(row.enriched_at);
  if (!Number.isFinite(enrichedAt) || Date.now() - enrichedAt > CACHE_TTL_MS) return null;

  const parsed = JSON.parse(row.raw_json);
  return {
    ...parsed,
    cache: { hit: true, enrichedAt: row.enriched_at },
  };
}

function writeCachedResult(result) {
  const company = result.company || {};
  const firmographics = company.firmographics || {};
  const location = company.location || {};
  const ipFlags = result.ipLookup?.record || {};
  const enrichedAt = new Date().toISOString();

  dbRun(`
    INSERT OR REPLACE INTO ip_enrichment_cache (
      ip, provider, status, confidence_label, company_name, company_website,
      employees, revenue, industry, city, region, country, is_isp, is_mobile,
      is_wifi, raw_json, enriched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    result.ip,
    result.provider,
    result.status,
    result.confidenceLabel,
    company.name || null,
    company.website || null,
    firmographics.employees || null,
    firmographics.revenue || null,
    firmographics.naicsDesc || firmographics.sicDesc || firmographics.naicsGroup || firmographics.sicGroup || null,
    location.city || null,
    location.regionShort || location.region || null,
    location.countryShort || location.country || null,
    ipFlags.isISP ? 1 : 0,
    ipFlags.isMobile ? 1 : 0,
    ipFlags.isWifi ? 1 : 0,
    JSON.stringify(result),
    enrichedAt,
  ]);

  return enrichedAt;
}

async function resolveCompanyFromIpWithKickFire(ip) {
  try {
    const cached = readCachedResult(ip);
    if (cached) return cached;
  } catch (err) {
    console.warn('[kickfire] Cache read failed:', err.message);
  }

  if (!process.env.KICKFIRE_API_KEY) {
    return syntheticFallbackResult(ip);
  }

  const ipLookup = await lookupKickFireCompanyByIp(ip);
  let companyProfile = null;

  if (ipLookup.found && ipLookup.record?.website) {
    companyProfile = await lookupKickFireCompanyByWebsite(ipLookup.record.website);
  }

  const classification = classify(ipLookup, companyProfile);
  const result = {
    ip,
    provider: PROVIDER,
    ...classification,
    company: ipLookup.found ? mergeCompany(ipLookup, companyProfile) : null,
    ipLookup,
    companyProfile,
  };

  try {
    const enrichedAt = writeCachedResult(result);
    result.cache = { hit: false, enrichedAt };
  } catch (err) {
    console.warn('[kickfire] Cache write failed:', err.message);
  }

  return result;
}

module.exports = {
  lookupKickFireCompanyByIp,
  lookupKickFireCompanyByWebsite,
  resolveCompanyFromIpWithKickFire,
  normalizeWebsite,
};
