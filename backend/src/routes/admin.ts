import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAdmin } from '../middleware/auth';
import { AdminRow, UserRow } from '../types';

const router = Router();

// Alle Routen hier sind Admin-only
router.use(requireAdmin);

/**
 * GET /admin/users
 * Listet alle User-Accounts auf (ohne access_code).
 */
router.get('/users', (_req: Request, res: Response): void => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY created_at DESC').all() as Omit<UserRow, 'access_code' | 'role'>[];
  res.json(users);
});

/**
 * POST /admin/users
 * Legt einen neuen User-Account an.
 * Body: { username: string, accessCode: string }
 */
router.post('/users', (req: Request, res: Response): void => {
  const { username, accessCode } = req.body ?? {};

  if (!username || typeof username !== 'string' || username.trim() === '') {
    res.status(400).json({ error: 'username ist erforderlich' });
    return;
  }
  if (!accessCode || typeof accessCode !== 'string' || accessCode.trim() === '') {
    res.status(400).json({ error: 'accessCode ist erforderlich' });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO users (username, access_code) VALUES (?, ?)')
      .run(username.trim(), accessCode.trim());
    res.status(201).json({ id: result.lastInsertRowid, username: username.trim() });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'username oder accessCode bereits vergeben' });
    } else {
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }
});

/**
 * DELETE /admin/users/:id
 * Löscht einen User-Account.
 */
router.delete('/users/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
  if (info.changes === 0) {
    res.status(404).json({ error: 'User nicht gefunden' });
    return;
  }
  res.json({ success: true });
});

/**
 * PUT /admin/users/:id/code
 * Ändert den Access Code eines Users.
 * Body: { accessCode: string }
 */
router.put('/users/:id/code', (req: Request, res: Response): void => {
  const { id } = req.params;
  const { accessCode } = req.body ?? {};

  if (!accessCode || typeof accessCode !== 'string' || accessCode.trim() === '') {
    res.status(400).json({ error: 'accessCode ist erforderlich' });
    return;
  }

  try {
    const info = db
      .prepare('UPDATE users SET access_code = ? WHERE id = ?')
      .run(accessCode.trim(), Number(id));
    if (info.changes === 0) {
      res.status(404).json({ error: 'User nicht gefunden' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Dieser Access Code ist bereits vergeben' });
    } else {
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }
});

/**
 * PUT /admin/password
 * Ändert das Admin-Passwort.
 * Body: { currentPassword: string, newPassword: string }
 */
router.put('/password', (req: Request, res: Response): void => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword und newPassword sind erforderlich' });
    return;
  }

  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get() as AdminRow;
  if (!bcrypt.compareSync(String(currentPassword), admin.password_hash)) {
    res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    return;
  }

  const hash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hash);
  res.json({ success: true });
});

/**
 * GET /admin/export
 * Exportiert alle kv_store-Einträge als lesbares JSON (segmentiert nach Typ).
 */
router.get('/export', (_req: Request, res: Response): void => {
  const rows = db.prepare('SELECT key, value FROM kv_store ORDER BY key').all() as { key: string; value: string }[];

  const result: {
    version: number;
    exportedAt: string;
    algorithms: unknown[];
    index: unknown;
    mnemonics: unknown;
    questions: Record<string, unknown>;
    poolIndex: unknown;
  } = {
    version: 2,
    exportedAt: new Date().toISOString(),
    algorithms: [],
    index: [],
    mnemonics: [],
    questions: {},
    poolIndex: [],
  };

  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (row.key === 'v2-index') {
        result.index = parsed;
      } else if (row.key === 'v2-mnemonics') {
        result.mnemonics = parsed;
      } else if (row.key === 'v2-pool-index') {
        result.poolIndex = parsed;
      } else if (row.key.startsWith('v2-fc:')) {
        result.algorithms.push(parsed);
      } else if (row.key.startsWith('v2-qset:')) {
        result.questions[row.key.slice('v2-qset:'.length)] = parsed;
      }
    } catch { /* skip malformed entries */ }
  }

  res.json(result);
});

/**
 * POST /admin/import
 * Importiert Daten aus einem Export-JSON.
 * Unterstützt das alte Format { entries: [{key, value}] } sowie das
 * aktuelle segmentierte Format { algorithms, index, mnemonics, questions }.
 * Body enthält optional filter: 'all' | 'algorithms' | 'questions'
 */
router.post('/import', (req: Request, res: Response): void => {
  const body = req.body ?? {};
  const filter: string = body.filter ?? 'all';

  const upsert = db.prepare(`
    INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  // ── Altes Format: { entries: [{key, value}] } ──────────────────────────────
  if (Array.isArray(body.entries)) {
    const importOld = db.transaction((entries: { key: string; value: string }[]) => {
      let count = 0;
      for (const row of entries) {
        if (typeof row.key !== 'string' || typeof row.value !== 'string') continue;
        if (filter === 'algorithms' && !row.key.startsWith('v2-fc:') && row.key !== 'v2-index' && row.key !== 'v2-mnemonics') continue;
        if (filter === 'questions' && !row.key.startsWith('v2-qset:')) continue;
        upsert.run(row.key, row.value);
        count++;
      }
      return count;
    });
    try {
      res.json({ success: true, imported: importOld(body.entries as { key: string; value: string }[]) });
    } catch {
      res.status(500).json({ error: 'Import fehlgeschlagen' });
    }
    return;
  }

  // ── Neues Format: { version, algorithms, index, mnemonics, questions } ─────
  const importNew = db.transaction(() => {
    let count = 0;
    const doAlgos = filter === 'all' || filter === 'algorithms';
    const doQs    = filter === 'all' || filter === 'questions';

    if (doAlgos) {
      if (body.index !== undefined) {
        upsert.run('v2-index', JSON.stringify(body.index));
        count++;
      }
      if (body.mnemonics !== undefined) {
        upsert.run('v2-mnemonics', JSON.stringify(body.mnemonics));
        count++;
      }
      if (body.poolIndex !== undefined) {
        upsert.run('v2-pool-index', JSON.stringify(body.poolIndex));
        count++;
      }
      if (Array.isArray(body.algorithms)) {
        for (const algo of body.algorithms as { id?: string }[]) {
          if (typeof algo?.id === 'string') {
            upsert.run(`v2-fc:${algo.id}`, JSON.stringify(algo));
            count++;
          }
        }
      }
    }

    if (doQs && body.questions && typeof body.questions === 'object') {
      for (const [fcId, qs] of Object.entries(body.questions as Record<string, unknown>)) {
        upsert.run(`v2-qset:${fcId}`, JSON.stringify(qs));
        count++;
      }
    }

    return count;
  });

  try {
    res.json({ success: true, imported: importNew() });
  } catch {
    res.status(500).json({ error: 'Import fehlgeschlagen' });
  }
});

export default router;
