#!/usr/bin/env bash
# Throwaway Postgres for the RLS test suite.
#
#   scripts/test-db.sh up     start (and wait for) the container
#   scripts/test-db.sh down   remove it
#
# This is a plain Postgres with a small shim (tests/db/shim) standing in for
# the Supabase-provided auth schema and API roles — far lighter than running
# the full Supabase stack just to exercise policies.
set -euo pipefail

NAME="${TEST_DB_CONTAINER:-britetrack-test-db}"
PORT="${TEST_DB_PORT:-54329}"
IMAGE="${TEST_DB_IMAGE:-postgres:16-alpine}"

case "${1:-up}" in
  up)
    if [ -n "$(docker ps -q -f "name=^${NAME}$")" ]; then
      echo "${NAME} already running on port ${PORT}"
      exit 0
    fi
    docker rm -f "${NAME}" >/dev/null 2>&1 || true
    docker run -d --name "${NAME}" \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=britetrack_test \
      -p "${PORT}:5432" \
      "${IMAGE}" >/dev/null

    printf 'waiting for postgres on %s' "${PORT}"
    for _ in $(seq 1 60); do
      if docker exec "${NAME}" pg_isready -U postgres -d britetrack_test >/dev/null 2>&1; then
        echo " ready"
        exit 0
      fi
      printf '.'
      sleep 1
    done
    echo " timed out"
    docker logs "${NAME}" | tail -20
    exit 1
    ;;
  down)
    docker rm -f "${NAME}" >/dev/null 2>&1 || true
    echo "${NAME} removed"
    ;;
  *)
    echo "usage: $0 {up|down}" >&2
    exit 1
    ;;
esac
