'use strict';

const PROVIDER = 'kickfire';
const DEFAULT_BASE_URL = 'https://api.kickfire.com/v3';

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

module.exports = {
  PROVIDER,
  lookupKickFireCompanyByIp,
  lookupKickFireCompanyByWebsite,
  normalizeKickFireCompany,
  normalizeWebsite,
};
