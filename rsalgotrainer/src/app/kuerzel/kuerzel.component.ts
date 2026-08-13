import { Component, inject, signal, computed } from '@angular/core';
import { MnemonicDataService } from '../services/mnemonic-data.service';
import { AuthService } from '../services/auth.service';
import { Mnemonic } from '../models/mnemonic';

@Component({
  selector: 'app-kuerzel',
  imports: [],
  templateUrl: './kuerzel.component.html',
  styleUrl: './kuerzel.component.scss'
})
export class KuerzelComponent {
  data = inject(MnemonicDataService);
  auth = inject(AuthService);

  mode       = signal<'ueben' | 'bearbeiten'>('ueben');
  selectedId = signal<string | null>(null);
  revealed   = signal<Set<string>>(new Set());

  readonly current = computed<Mnemonic | null>(() => {
    const id = this.selectedId();
    const list = this.data.mnemonics();
    return id ? (list.find(m => m.id === id) ?? list[0] ?? null) : (list[0] ?? null);
  });

  readonly revealedCount = computed(() => this.revealed().size);
  readonly allRevealed   = computed(() => {
    const c = this.current();
    return c ? c.items.every(it => this.revealed().has(it.id)) : false;
  });

  selectMnemonic(id: string): void { this.selectedId.set(id); this.revealed.set(new Set()); }
  setMode(m: 'ueben' | 'bearbeiten'): void { this.mode.set(m); this.revealed.set(new Set()); }

  reveal(itemId: string): void   { this.revealed.update(s => new Set([...s, itemId])); }
  revealAll(): void              { const c = this.current(); if (c) this.revealed.set(new Set(c.items.map(i => i.id))); }
  reset(): void                  { this.revealed.set(new Set()); }

  // ─── Edit ─────────────────────────────────────────────────────────────────

  addMnemonic(): void {
    const m = this.data.add();
    this.selectedId.set(m.id);
  }

  async removeMnemonic(): Promise<void> {
    const c = this.current();
    if (!c) return;
    const idx = this.data.mnemonics().findIndex(m => m.id === c.id);
    this.data.remove(c.id);
    const rem = this.data.mnemonics();
    this.selectedId.set(rem[Math.max(0, idx - 1)]?.id ?? null);
    await this.data.save();
  }

  onAcronymChange(e: Event): void {
    const c = this.current();
    if (c) this.data.update(c.id, { acronym: (e.target as HTMLInputElement).value.toUpperCase() });
  }

  onTitleChange(e: Event): void {
    const c = this.current();
    if (c) this.data.update(c.id, { title: (e.target as HTMLInputElement).value });
  }

  addItem(): void  { const c = this.current(); if (c) this.data.addItem(c.id); }

  onLetterChange(itemId: string, e: Event): void {
    const c = this.current();
    if (c) this.data.updateItem(c.id, itemId, { letter: (e.target as HTMLInputElement).value.toUpperCase() });
  }

  onLabelChange(itemId: string, e: Event): void {
    const c = this.current();
    if (c) this.data.updateItem(c.id, itemId, { label: (e.target as HTMLInputElement).value });
  }

  removeItem(itemId: string): void { const c = this.current(); if (c) this.data.removeItem(c.id, itemId); }

  async saveAll(): Promise<void> { await this.data.save(); }
}
