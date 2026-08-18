import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StorageAdapterService } from './storage-adapter.service';
import { API_URL } from './api-url.token';
import { AuthService } from './auth.service';

interface StoreResponse  { value: string }
interface WriteResponse  { success: boolean; applied?: boolean; requestId?: string }

@Injectable()
export class HttpStorageAdapterService extends StorageAdapterService {
  private http    = inject(HttpClient);
  private baseUrl = inject(API_URL);
  private auth    = inject(AuthService);

  private authHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  override async get(key: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<StoreResponse>(`${this.baseUrl}/store/${encodeURIComponent(key)}`)
      );
      return res.value;
    } catch (err) {
      if (err instanceof HttpErrorResponse && (err.status === 404 || err.status === 0)) return null;
      throw err;
    }
  }

  override async set(key: string, value: string): Promise<void> {
    const token = this.auth.getToken();
    if (!token) throw new Error('NOT_LOGGED_IN');

    const res = await firstValueFrom(
      this.http.put<WriteResponse>(
        `${this.baseUrl}/store/${encodeURIComponent(key)}`,
        { value },
        { headers: this.authHeaders() }
      )
    );

    // 202 applied=false → Änderungsantrag wurde erstellt, nicht direkt gespeichert
    if (res.applied === false) {
      this.auth.notifyPendingChange();
      throw new Error('PENDING_APPROVAL');
    }
  }

  override async delete(key: string): Promise<void> {
    const token = this.auth.getToken();
    if (!token) throw new Error('NOT_LOGGED_IN');

    const res = await firstValueFrom(
      this.http.delete<WriteResponse>(
        `${this.baseUrl}/store/${encodeURIComponent(key)}`,
        { headers: this.authHeaders() }
      )
    );

    if (res.applied === false) {
      this.auth.notifyPendingChange();
      throw new Error('PENDING_APPROVAL');
    }
  }
}
