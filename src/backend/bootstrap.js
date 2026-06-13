'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'egain.db');

function hasSeededAccounts() {
  if (!fs.existsSync(DB_PATH)) return false;

  let db;
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
    ).get();
    if (!table) return false;

    const row = db.prepare('SELECT COUNT(*) AS count FROM accounts').get();
    return Number(row?.count || 0) > 0;
  } catch {
    return false;
  } finally {
    if (db) db.close();
  }
}

function runNode(script) {
  execFileSync(process.execPath, [script], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });
}

if (hasSeededAccounts()) {
  console.log(`[bootstrap] Seed database already has accounts: ${DB_PATH}`);
  process.exit(0);
}

console.log(`[bootstrap] No seeded accounts found. Building demo database at ${DB_PATH}`);
runNode('src/log-generator/generate.js');
runNode('src/backend/parse.js');
runNode('src/backend/seed-ai.js');
console.log('[bootstrap] Demo database is ready.');
