'use strict';

const { dbGet, dbRun } = require('../db');
const {
  PROVIDER,
  lookupKickFireCompanyByIp,
  lookupKickFireCompanyByWebsite,
  normalizeKickFireCompany,
  normalizeWebsite,
} = require('../adapters/kickfireAdapter');
const { syntheticFallbackResult } = require('../mocks/kickfireSyntheticFallback');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
