#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "→ Docker-Images bauen und Container starten..."
docker compose up --build -d

echo ""
echo "✓ Läuft."
echo "  Frontend: http://localhost:4200  →  https://rsalgotrainer.gordlby.at"
echo "  Backend:  http://localhost:3000  →  https://rsalgotrainerapi.gordlby.at"
echo ""
echo "  Logs:     docker compose logs -f"
echo "  Stoppen:  ./stop.sh"
