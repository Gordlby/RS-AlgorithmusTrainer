import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './api-url.token';

export interface AuthUser {
  userId: number;
  username: string;
  role: 'admin' | 'user';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http    = inject(HttpClient);
  private baseUrl = inject(API_URL);

  private _user  = signal<AuthUser | null>(null);
  private _token = signal<string | null>(null);

  readonly user      = this._user.asReadonly();
  readonly isAdmin   = computed(() => this._user()?.role === 'admin');
  readonly isLoggedIn = computed(() => this._user() !== null);

  // Pending-Change-Counter: erhöht sich wenn ein User-Antrag eingereicht wurde
  readonly pendingCount = signal(0);

  constructor() { this.loadFromStorage(); }

  private loadFromStorage(): void {
    const token = localStorage.getItem('rs_auth_token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as AuthUser & { exp: number };
      if (payload.exp * 1000 < Date.now()) { this.logout(); return; }
      this._token.set(token);
      this._user.set({ userId: payload.userId, username: payload.username, role: payload.role });
    } catch { this.logout(); }
  }

  getToken(): string | null { return this._token(); }

  /** Login: accessCode → User, username + password → Admin */
  async login(accessCodeOrUsername: string, password?: string): Promise<void> {
    const body = password
      ? { username: accessCodeOrUsername, password }
      : { accessCode: accessCodeOrUsername };
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(`${this.baseUrl}/auth/login`, body)
    );
    localStorage.setItem('rs_auth_token', res.token);
    this.loadFromStorage();
  }

  logout(): void {
    localStorage.removeItem('rs_auth_token');
    this._token.set(null);
    this._user.set(null);
  }

  notifyPendingChange(): void {
    this.pendingCount.update(n => n + 1);
  }
}
