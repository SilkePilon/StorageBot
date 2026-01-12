#!/bin/sh
set -e

# Wait for PostgreSQL with timeout
MAX_RETRIES=30
RETRY_COUNT=0

echo "Waiting for PostgreSQL..."
until nc -z postgres 5432; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Error: PostgreSQL not available after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL not ready, retrying ($RETRY_COUNT/$MAX_RETRIES)..."
  sleep 2
done
echo "PostgreSQL is ready!"

# Apply database schema (generate is already done during build)
# Note: If schema changes require data loss, this will fail. Review changes manually.
npx prisma db push --url "$DATABASE_URL"

exec "$@"
