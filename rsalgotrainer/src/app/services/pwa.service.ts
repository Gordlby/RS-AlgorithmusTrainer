import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PwaService {
  readonly canInstall   = signal(false);
  // iOS Safari has no beforeinstallprompt — user must use Share → "Add to Home Screen"
  readonly isIos        = signal(false);
  readonly isStandalone = signal(false);

  private deferredPrompt: any = null;

  constructor() {
    const ua = navigator.userAgent.toLowerCase();
    this.isIos.set(/iphone|ipad|ipod/.test(ua));
    this.isStandalone.set(
      (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );

    // Pick up event captured before Angular booted (main.ts)
    if ((window as any).__pwaPrompt) {
      this.deferredPrompt = (window as any).__pwaPrompt;
      this.canInstall.set(true);
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
    });
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }
}
