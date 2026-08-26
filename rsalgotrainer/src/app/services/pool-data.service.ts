import { Injectable, inject, signal } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';

export interface Pool { id: string; name: string; }

const POOL_INDEX_KEY = 'v2-pool-index';

@Injectable({ providedIn: 'root' })
export class PoolDataService {
  private storage = inject(StorageAdapterService);

  readonly pools       = signal<Pool[]>([]);
  readonly currentPoolId = signal<string | null>(null);

  uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async init(): Promise<void> {
    const str = await this.storage.get(POOL_INDEX_KEY);
    if (str) {
      this.pools.set(JSON.parse(str));
    } else {
      const defaultPool: Pool = { id: this.uid(), name: 'Anatomie 1' };
      this.pools.set([defaultPool]);
      await this.storage.set(POOL_INDEX_KEY, JSON.stringify([defaultPool]));
    }
  }

  selectPool(id: string): void {
    this.currentPoolId.set(this.currentPoolId() === id ? null : id);
  }

  clearPool(): void { this.currentPoolId.set(null); }

  async createPool(name: string): Promise<void> {
    const pool: Pool = { id: this.uid(), name };
    this.pools.update(p => [...p, pool]);
    await this.storage.set(POOL_INDEX_KEY, JSON.stringify(this.pools()));
  }

  async deletePool(id: string): Promise<void> {
    this.pools.update(p => p.filter(x => x.id !== id));
    if (this.currentPoolId() === id) this.currentPoolId.set(null);
    await this.storage.set(POOL_INDEX_KEY, JSON.stringify(this.pools()));
  }

  async renamePool(id: string, name: string): Promise<void> {
    this.pools.update(p => p.map(x => x.id === id ? { ...x, name } : x));
    await this.storage.set(POOL_INDEX_KEY, JSON.stringify(this.pools()));
  }

  currentPool() {
    const id = this.currentPoolId();
    return id ? this.pools().find(p => p.id === id) ?? null : null;
  }
}
