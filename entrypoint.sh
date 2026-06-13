#!/bin/sh
set -e

if [ -z "$OPENAI_API_KEY" ]; then
  echo "[startup] WARNING: OPENAI_API_KEY is not set. AI summaries will use pre-generated defaults. Set the key to enable live generation." >&2
fi

DB_PATH="${DB_PATH:-/data/egain.db}"
export DB_PATH

# On first start the volume is empty — seed from the image's baked-in database.
# On subsequent starts the persisted DB (with cached AI content) is used as-is.
if [ ! -f "$DB_PATH" ]; then
  echo "[startup] First run — seeding database from image..."
  cp /app/egain.db.seed "$DB_PATH"
  echo "[startup] Done."
fi

# NODE_NO_WARNINGS suppresses the node:sqlite experimental warning in logs
exec env NODE_NO_WARNINGS=1 node src/backend/server.js
