'use strict';

// Populates ai_content table from default-ai-content.json.
// Run after parse.js during Docker build so the seed DB ships with AI content.
// Safe to re-run — uses INSERT OR REPLACE.

require('dotenv').config();
const path    = require('path');
const { getDb } = require('./db');

const defaults = require('./default-ai-content.json');
const db       = getDb();
const now      = Date.now();

// Treat the defaults file as authoritative for seeded demo AI content.
// Without this, removed fixture accounts keep stale cached rows forever.
db.exec('DELETE FROM ai_content');

const insert = db.prepare(
  'INSERT OR REPLACE INTO ai_content (account_id, type, content, generated_at) VALUES (?, ?, ?, ?)'
);

let count = 0;
for (const [accountId, content] of Object.entries(defaults)) {
  for (const type of ['summary', 'stage_rationale', 'recommendations', 'email']) {
    if (content[type] != null) {
      insert.run(accountId, type, JSON.stringify(content[type]), now);
      count++;
    }
  }
}

console.log(`[seed-ai] Inserted ${count} default AI content rows for ${Object.keys(defaults).length} accounts.`);
