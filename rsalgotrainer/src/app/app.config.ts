import { APP_INITIALIZER, ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { StorageAdapterService } from './services/storage-adapter.service';
import { HttpStorageAdapterService } from './services/http-storage-adapter.service';
import { AlgoDataService } from './services/algo-data.service';
import { MnemonicDataService } from './services/mnemonic-data.service';

function initApp(algoData: AlgoDataService, mnemonicData: MnemonicDataService): () => Promise<void> {
  return () => Promise.all([algoData.init(), mnemonicData.init()]).then(() => {});
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    { provide: StorageAdapterService, useClass: HttpStorageAdapterService },
    { provide: APP_INITIALIZER, useFactory: initApp, deps: [AlgoDataService, MnemonicDataService], multi: true },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately'
    }),
  ]
};
