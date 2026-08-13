import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DatePipe } from '@angular/common';
import { AuthService } from '../services/auth.service';
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

@Component({
  selector: 'app-admin-requests',
  imports: [DatePipe],
  templateUrl: './admin-requests.component.html',
  styleUrl: './admin-requests.component.scss'
})
export class AdminRequestsComponent implements OnInit {
  private http    = inject(HttpClient);
  private auth    = inject(AuthService);
  private baseUrl = inject(API_URL);

  requests = signal<ChangeRequest[]>([]);
  loading  = signal(true);
  message  = signal('');

  private get headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async ngOnInit(): Promise<void> { await this.load(); }

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
}
