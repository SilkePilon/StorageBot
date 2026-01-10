#!/bin/sh
set -e

# Wait for PostgreSQL
until nc -z postgres 5432; do
  sleep 2
done

# Apply database schema
npx prisma db push --skip-generate

exec "$@"
