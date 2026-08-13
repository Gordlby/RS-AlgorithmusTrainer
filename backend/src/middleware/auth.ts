import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht in .env gesetzt');
  return s;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Kein Token übermittelt' });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), getSecret()) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Nur für Admins' });
      return;
    }
    next();
  });
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}
