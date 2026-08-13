import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { AdminRow, UserRow } from '../types';

const router = Router();

/**
 * POST /auth/login
 *
 * Zwei Varianten:
 *   User-Login:  { accessCode: string }
 *   Admin-Login: { username: string, password: string }
 *
 * Gibt bei Erfolg ein JWT zurück.
 */
router.post('/login', (req: Request, res: Response): void => {
  const { accessCode, username, password } = req.body ?? {};

  // ── Admin-Login ────────────────────────────────────────────────────────
  if (username && password) {
    const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username) as AdminRow | undefined;
    if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
      res.status(401).json({ error: 'Ungültige Admin-Zugangsdaten' });
      return;
    }
    const token = signToken({ userId: admin.id, username: admin.username, role: 'admin' });
    res.json({ token, role: 'admin', username: admin.username });
    return;
  }

  // ── User-Login (nur Access Code) ──────────────────────────────────────
  if (accessCode) {
    const user = db.prepare('SELECT * FROM users WHERE access_code = ?').get(String(accessCode)) as UserRow | undefined;
    if (!user) {
      res.status(401).json({ error: 'Unbekannter Access Code' });
      return;
    }
    const token = signToken({ userId: user.id, username: user.username, role: 'user' });
    res.json({ token, role: 'user', username: user.username });
    return;
  }

  res.status(400).json({ error: 'accessCode oder username+password erforderlich' });
});

/**
 * GET /auth/me
 * Gibt den aktuellen User zurück (Token-Verifikation).
 */
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ userId: req.user!.userId, username: req.user!.username, role: req.user!.role });
});

export default router;
