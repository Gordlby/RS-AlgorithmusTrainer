import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { NetworkService } from '../services/network.service';
import { API_URL } from '../services/api-url.token';

interface ChangeRequest {
  id: string;
  user_id: number;
  username: string;
  key: string;
  value: string;
  old_value: string | null;
  status: string;
  created_at: string;
}

interface NodeDiff {
  kind: 'changed' | 'added' | 'removed';
  label: string;
  oldLabel?: string;
}

interface User { id: number; username: string; created_at: string; }

@Component({
  selector: 'app-admin-requests',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-requests.component.html',
  styleUrl: './admin-requests.component.scss'
})
export class AdminRequestsComponent implements OnInit {
  private http    = inject(HttpClient);
  private auth    = inject(AuthService);
  readonly network = inject(NetworkService);
  private baseUrl = inject(API_URL);

  tab = signal<'requests' | 'users'>('requests');

  requests = signal<ChangeRequest[]>([]);
  loading  = signal(true);
  message  = signal('');

  // ─── User management ─────────────────────────────────────────────────────
  users        = signal<User[]>([]);
  usersLoading = signal(false);
  newUsername  = signal('');
  newCode      = signal('');
  userMsg      = signal('');
  editingCodeId = signal<number | null>(null);
  editingCode   = signal('');

  private get headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async ngOnInit(): Promise<void> { await this.load(); await this.loadUsers(); }

  async setTab(t: 'requests' | 'users'): Promise<void> {
    this.tab.set(t);
    if (t === 'users') await this.loadUsers();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(
        this.http.get<ChangeRequest[]>(`${this.baseUrl}/change-requests`, { headers: this.headers })
      );
      this.requests.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  /** Zeigt einen lesbaren Schlüssel (v2-fc:xyz → Algorithmus-Daten) */
  keyLabel(key: string): string {
    if (key === 'v2-index') return 'Algorithmus-Liste';
    if (key.startsWith('v2-fc:')) return 'Algorithmus-Inhalt';
    return key;
  }

  /** Node-Level-Diff zwischen old_value und value für Flowchart-Änderungen */
  diff(req: ChangeRequest): NodeDiff[] {
    if (!req.old_value || req.value === '__DELETE__') return [];
    try {
      const oldFc = JSON.parse(req.old_value);
      const newFc = JSON.parse(req.value);
      const result: NodeDiff[] = [];

      if (oldFc.title !== newFc.title) {
        result.push({ kind: 'changed', label: newFc.title, oldLabel: oldFc.title });
      }

      const oldMap = new Map<string, any>(oldFc.nodes?.map((n: any) => [n.id, n]) ?? []);
      const newMap = new Map<string, any>(newFc.nodes?.map((n: any) => [n.id, n]) ?? []);

      for (const [id, newNode] of newMap) {
        const oldNode = oldMap.get(id);
        if (!oldNode) {
          result.push({ kind: 'added', label: this.nodeText(newNode) });
        } else {
          const o = this.nodeText(oldNode), n = this.nodeText(newNode);
          if (o !== n) result.push({ kind: 'changed', label: n, oldLabel: o });
        }
      }
      for (const [id, oldNode] of oldMap) {
        if (!newMap.has(id)) result.push({ kind: 'removed', label: this.nodeText(oldNode) });
      }
      return result;
    } catch { return []; }
  }

  private nodeText(node: any): string {
    return (node.key ? node.key + ': ' : '') + (node.text || '(leer)');
  }

  fcTitle(req: ChangeRequest): string {
    if (req.value === '__DELETE__') return '(Löschen)';
    try { return JSON.parse(req.value).title ?? ''; } catch { return ''; }
  }

  async approve(id: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.baseUrl}/change-requests/${id}/approve`, {}, { headers: this.headers })
    );
    this.message.set('Genehmigt ✓');
    await this.load();
    setTimeout(() => this.message.set(''), 3000);
  }

  async reject(id: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.baseUrl}/change-requests/${id}/reject`, {}, { headers: this.headers })
    );
    this.message.set('Abgelehnt.');
    await this.load();
    setTimeout(() => this.message.set(''), 3000);
  }

  // ─── User management ─────────────────────────────────────────────────────
  async loadUsers(): Promise<void> {
    this.usersLoading.set(true);
    try {
      const rows = await firstValueFrom(
        this.http.get<User[]>(`${this.baseUrl}/admin/users`, { headers: this.headers })
      );
      this.users.set(rows);
    } finally { this.usersLoading.set(false); }
  }

  async createUser(): Promise<void> {
    const username = this.newUsername().trim();
    const accessCode = this.newCode().trim();
    if (!username || !accessCode) { this.userMsg.set('Username und Code sind erforderlich.'); return; }
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/admin/users`, { username, accessCode }, { headers: this.headers })
      );
      this.newUsername.set(''); this.newCode.set('');
      this.userMsg.set('Nutzer erstellt ✓');
      await this.loadUsers();
    } catch (e: any) {
      this.userMsg.set(e?.error?.error ?? 'Fehler beim Erstellen.');
    }
    setTimeout(() => this.userMsg.set(''), 4000);
  }

  async deleteUser(id: number): Promise<void> {
    if (!confirm('Nutzer wirklich löschen?')) return;
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/admin/users/${id}`, { headers: this.headers })
    );
    await this.loadUsers();
  }

  startEditCode(user: User): void {
    this.editingCodeId.set(user.id);
    this.editingCode.set('');
  }

  async saveCode(userId: number): Promise<void> {
    const code = this.editingCode().trim();
    if (!code) return;
    try {
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/admin/users/${userId}/code`, { accessCode: code }, { headers: this.headers })
      );
      this.editingCodeId.set(null);
      this.userMsg.set('Code geändert ✓');
      await this.loadUsers();
    } catch (e: any) {
      this.userMsg.set(e?.error?.error ?? 'Fehler.');
    }
    setTimeout(() => this.userMsg.set(''), 4000);
  }

  cancelEditCode(): void { this.editingCodeId.set(null); }

  get newUsernameStr(): string { return this.newUsername(); }
  set newUsernameStr(v: string) { this.newUsername.set(v); }
  get newCodeStr(): string { return this.newCode(); }
  set newCodeStr(v: string) { this.newCode.set(v); }
  get editingCodeStr(): string { return this.editingCode(); }
  set editingCodeStr(v: string) { this.editingCode.set(v); }
}
