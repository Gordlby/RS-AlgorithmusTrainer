/**
 * Abstract storage adapter – swap LocalStorageAdapterService for an
 * HttpStorageAdapterService (or any other backend) without touching any
 * component or the AlgoDataService.
 *
 * To use a different backend: change the provider in app.config.ts:
 *   { provide: StorageAdapterService, useClass: YourBackendAdapter }
 */
export abstract class StorageAdapterService {
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
}
