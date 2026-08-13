import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';

/**
 * Geteilter Key-Value-Store.
 * GET  → öffentlich (kein Auth nötig)
 * PUT  → erfordert Auth:  Admin → direkt anwenden | User → Änderungsantrag erstellen (202)
 * DELETE → gleiche Logik wie PUT
 */
const router = Router();

interface KvRow { key: string; value: string }

router.get('/:key', (req: Request, res: Response): void => {
  const row = db
    .prepare('SELECT value FROM kv_store WHERE key = ?')
    .get(req.params['key']) as KvRow | undefined;

  if (!row) { res.status(404).json({ error: 'Nicht gefunden' }); return; }
  res.json({ value: row.value });
});

router.put('/:key', requireAuth, (req: Request, res: Response): void => {
  const { value } = req.body ?? {};
  if (typeof value !== 'string') {
    res.status(400).json({ error: 'value (string) erforderlich' }); return;
  }

  if (req.user!.role === 'admin') {
    db.prepare(`
      INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(req.params['key'], value);
    res.json({ success: true, applied: true });
  } else {
    const id = randomUUID();
    const existing = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(req.params['key']) as KvRow | undefined;
    db.prepare(
      'INSERT INTO change_requests (id, user_id, username, key, value, old_value) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.user!.userId, req.user!.username, req.params['key'], value, existing?.value ?? null);
    res.status(202).json({ success: true, applied: false, requestId: id });
  }
});

router.delete('/:key', requireAuth, (req: Request, res: Response): void => {
  if (req.user!.role === 'admin') {
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(req.params['key']);
    res.json({ success: true, applied: true });
  } else {
    const id = randomUUID();
    db.prepare(
      'INSERT INTO change_requests (id, user_id, username, key, value) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user!.userId, req.user!.username, req.params['key'], '__DELETE__');
    res.status(202).json({ success: true, applied: false, requestId: id });
  }
});

export default router;
