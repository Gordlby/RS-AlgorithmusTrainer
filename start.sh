#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Datenbank-Verzeichnis sicherstellen
mkdir -p backend/data

# Einmalige Migration: alte data.db in backend/data/ verschieben
if [ -f backend/data.db ] && [ ! -f backend/data/data.db ]; then
  echo "→ Datenbankdatei in backend/data/ migrieren..."
  cp backend/data.db backend/data/data.db
fi

echo "→ Docker-Images bauen und Container starten..."
docker compose up --build -d

echo ""
echo "✓ Läuft."
echo "  Frontend: http://localhost:4200  →  https://rsalgotrainer.gordlby.at"
echo "  Backend:  http://localhost:3000  →  https://rsalgotrainerapi.gordlby.at"
echo ""
echo "  Logs:     docker compose logs -f"
echo "  Stoppen:  ./stop.sh"
