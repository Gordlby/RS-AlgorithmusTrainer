import { Injectable } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';

@Injectable()
export class LocalStorageAdapterService extends StorageAdapterService {
  override get(key: string): Promise<string | null> {
    return Promise.resolve(localStorage.getItem(key));
  }

  override set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }

  override delete(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }
}
