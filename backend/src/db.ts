import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'data.db');

export const db = new Database(DB_PATH);

// WAL-Modus für bessere Concurrent-Reads
db.pragma('journal_mode = WAL');

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id            INTEGER PRIMARY KEY,
      username      TEXT    NOT NULL,
      password_hash TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      access_code TEXT    NOT NULL UNIQUE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Geteilter Key-Value-Store für alle Algorithmen (alle Nutzer sehen dasselbe)
    CREATE TABLE IF NOT EXISTS kv_store (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Änderungsanträge von Nicht-Admin-Nutzern
    CREATE TABLE IF NOT EXISTS change_requests (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      username    TEXT    NOT NULL,
      key         TEXT    NOT NULL,
      value       TEXT    NOT NULL,   -- '__DELETE__' für Lösch-Anfragen
      status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by TEXT
    );
  `);

  // Migration: old_value Spalte hinzufügen falls fehlend
  try { db.exec('ALTER TABLE change_requests ADD COLUMN old_value TEXT'); } catch {}

  // Admin anlegen falls noch nicht vorhanden
  const existing = db.prepare('SELECT id FROM admin WHERE id = 1').get();
  if (!existing) {
    const rawPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
    const hash = bcrypt.hashSync(rawPassword, 10);
    db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
    console.log('✓ Admin-Account angelegt (Passwort aus .env ADMIN_PASSWORD)');
  }
}
