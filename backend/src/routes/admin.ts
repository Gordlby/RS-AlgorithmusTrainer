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

export default router;
