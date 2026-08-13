#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

docker compose down
echo "✓ Backend und Frontend gestoppt."
