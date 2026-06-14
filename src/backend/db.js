'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'egain.db');
let _db;

function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      domain          TEXT,
      industry        TEXT,
      employees       TEXT,
      revenue         TEXT,
      hq              TEXT,
      initials        TEXT,
      color           TEXT,
      intent_score    INTEGER,
      fit_score       INTEGER,
      buying_stage    TEXT,
      total_sessions  INTEGER,
      unique_ips      INTEGER,
      last_activity   INTEGER,
      trend           REAL,
      interest_scores TEXT,
      top_pages       TEXT,
      sessions        TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_content (
      account_id    TEXT NOT NULL,
      type          TEXT NOT NULL,
      content       TEXT NOT NULL,
      generated_at  INTEGER NOT NULL,
      PRIMARY KEY (account_id, type)
    );

    CREATE TABLE IF NOT EXISTS ip_enrichment_cache (
      ip               TEXT PRIMARY KEY,
      provider         TEXT NOT NULL,
      status           TEXT NOT NULL,
      confidence_label TEXT,
      company_name     TEXT,
      company_website  TEXT,
      employees        TEXT,
      revenue          TEXT,
      industry         TEXT,
      city             TEXT,
      region           TEXT,
      country          TEXT,
      is_isp           INTEGER,
      is_mobile        INTEGER,
      is_wifi          INTEGER,
      raw_json         TEXT NOT NULL,
      enriched_at      TEXT NOT NULL
    );
  `);

  return _db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbGet(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

function dbAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

function dbRun(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

module.exports = { getDb, dbGet, dbAll, dbRun };
