import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Capture the install prompt before Angular boots — it can fire very early.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__pwaPrompt = e;
});

// Register custom service worker (production only).
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
