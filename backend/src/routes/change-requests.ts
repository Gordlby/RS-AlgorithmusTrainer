import { Router, Request, Response } from 'express';
import { db } from '../db';
import { requireAdmin, requireAuth } from '../middleware/auth';

/**
 * Änderungsanträge (nur Admin kann sie sehen und bearbeiten)
 *
 * GET  /change-requests            → alle ausstehenden Anträge
 * PUT  /change-requests/:id/approve → Antrag genehmigen (Änderung anwenden)
 * PUT  /change-requests/:id/reject  → Antrag ablehnen
 */
const router = Router();

interface CrRow {
  id: string; user_id: number; username: string;
  key: string; value: string; status: string;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null;
}

// Eigene Anträge des eingeloggten Nutzers (pending + kürzlich abgelehnte)
router.get('/mine', requireAuth, (req: Request, res: Response): void => {
  const rows = db
    .prepare(`
      SELECT * FROM change_requests
      WHERE user_id = ?
        AND (status = 'pending' OR (status = 'rejected' AND reviewed_at >= datetime('now', '-7 days')))
      ORDER BY created_at DESC
    `)
    .all(req.user!.userId) as CrRow[];
  res.json(rows);
});

router.get('/', requireAdmin, (_req: Request, res: Response): void => {
  const rows = db
    .prepare(`SELECT * FROM change_requests WHERE status = 'pending' ORDER BY created_at DESC`)
    .all() as CrRow[];
  res.json(rows);
});

router.put('/:id/approve', requireAdmin, (req: Request, res: Response): void => {
  const row = db
    .prepare('SELECT * FROM change_requests WHERE id = ?')
    .get(req.params['id']) as CrRow | undefined;

  if (!row) { res.status(404).json({ error: 'Antrag nicht gefunden' }); return; }
  if (row.status !== 'pending') { res.status(400).json({ error: 'Antrag bereits bearbeitet' }); return; }

  if (row.value === '__DELETE__') {
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(row.key);
  } else {
    db.prepare(`
      INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(row.key, row.value);
  }

  db.prepare(`
    UPDATE change_requests
    SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ?
    WHERE id = ?
  `).run(req.user!.username, req.params['id']);

  res.json({ success: true });
});

router.put('/:id/reject', requireAdmin, (req: Request, res: Response): void => {
  const row = db
    .prepare('SELECT id, status FROM change_requests WHERE id = ?')
    .get(req.params['id']) as Pick<CrRow, 'id' | 'status'> | undefined;

  if (!row) { res.status(404).json({ error: 'Antrag nicht gefunden' }); return; }
  if (row.status !== 'pending') { res.status(400).json({ error: 'Antrag bereits bearbeitet' }); return; }

  db.prepare(`
    UPDATE change_requests
    SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?
    WHERE id = ?
  `).run(req.user!.username, req.params['id']);

  res.json({ success: true });
});

export default router;
