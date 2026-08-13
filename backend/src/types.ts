export type Role = 'admin' | 'user';

export interface UserRow {
  id: number;
  username: string;
  access_code: string;
  role: Role;
  created_at: string;
}

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
}

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
}

// Express request mit authentifiziertem User
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
