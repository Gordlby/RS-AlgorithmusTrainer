import { Injectable, inject, signal } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';
import { Mnemonic, MnemonicItem } from '../models/mnemonic';

const KEY = 'v2-mnemonics';

@Injectable({ providedIn: 'root' })
export class MnemonicDataService {
  private storage = inject(StorageAdapterService);

  readonly mnemonics = signal<Mnemonic[]>([]);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'pending' | 'error'>('idle');

  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    const str = await this.storage.get(KEY);
    if (str) {
      this.mnemonics.set(JSON.parse(str));
    } else {
      const seeds = this.buildSeedData();
      this.mnemonics.set(seeds);
      await this.storage.set(KEY, JSON.stringify(seeds));
    }
  }

  private uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async save(): Promise<void> {
    this.saveStatus.set('saving');
    try {
      await this.storage.set(KEY, JSON.stringify(this.mnemonics()));
      this.setStatus('saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      this.setStatus(msg === 'PENDING_APPROVAL' ? 'pending' : 'error');
    }
  }

  private setStatus(s: 'saved' | 'pending' | 'error'): void {
    this.saveStatus.set(s);
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.saveStatus.set('idle'), 4000);
  }

  add(): Mnemonic {
    const m: Mnemonic = { id: this.uid(), acronym: 'NEU', title: 'Neues Kürzel', items: [] };
    this.mnemonics.update(list => [...list, m]);
    return m;
  }

  update(id: string, changes: Partial<Omit<Mnemonic, 'id' | 'items'>>): void {
    this.mnemonics.update(list => list.map(m => m.id === id ? { ...m, ...changes } : m));
  }

  remove(id: string): void {
    this.mnemonics.update(list => list.filter(m => m.id !== id));
  }

  addItem(mnemonicId: string): void {
    const item: MnemonicItem = { id: this.uid(), letter: '', label: '' };
    this.mnemonics.update(list =>
      list.map(m => m.id === mnemonicId ? { ...m, items: [...m.items, item] } : m)
    );
  }

  updateItem(mnemonicId: string, itemId: string, changes: Partial<MnemonicItem>): void {
    this.mnemonics.update(list =>
      list.map(m => m.id !== mnemonicId ? m : {
        ...m, items: m.items.map(it => it.id === itemId ? { ...it, ...changes } : it)
      })
    );
  }

  removeItem(mnemonicId: string, itemId: string): void {
    this.mnemonics.update(list =>
      list.map(m => m.id !== mnemonicId ? m : {
        ...m, items: m.items.filter(it => it.id !== itemId)
      })
    );
  }

  private buildSeedData(): Mnemonic[] {
    const mk = (acronym: string, title: string, items: [string, string][]): Mnemonic => ({
      id: this.uid(), acronym, title,
      items: items.map(([letter, label]) => ({ id: this.uid(), letter, label }))
    });

    return [
      mk('SAMPLER', 'Anamnese-Erhebung', [
        ['S', 'Symptome – Hauptbeschwerden'],
        ['A', 'Allergien'],
        ['M', 'Medikamente (aktuelle)'],
        ['P', 'Patientengeschichte / Vorerkrankungen'],
        ['L', 'Letzte Mahlzeit'],
        ['E', 'Ereignis – was ist passiert?'],
        ['R', 'Risikofaktoren'],
      ]),
      mk('OPQRST', 'Schmerzanamnese', [
        ['O', 'Onset – Beginn / Auslöser'],
        ['P', 'Provocation/Palliation – Verstärkung / Linderung'],
        ['Q', 'Quality – Qualität des Schmerzes'],
        ['R', 'Region/Radiation – Lokalisation / Ausstrahlung'],
        ['S', 'Severity – Stärke (NRS 0–10)'],
        ['T', 'Time – Zeitverlauf / Dauer'],
      ]),
      mk('WASB', 'Bewusstloser Patient', [
        ['W', 'Weg – Sicherheit am Einsatzort prüfen'],
        ['A', 'Atmung prüfen'],
        ['S', 'Stabile Seitenlage'],
        ['B', 'Bewusstsein / Notruf'],
      ]),
      mk('DMS', 'Distale Kontrolle', [
        ['D', 'Durchblutung'],
        ['M', 'Motorik'],
        ['S', 'Sensibilität'],
      ]),
      mk('AVPU', 'Bewusstseinsskala', [
        ['A', 'Alert – wach und orientiert'],
        ['V', 'Voice – reagiert auf Ansprache'],
        ['P', 'Pain – reagiert nur auf Schmerz'],
        ['U', 'Unresponsive – keine Reaktion'],
      ]),
    ];
  }
}
