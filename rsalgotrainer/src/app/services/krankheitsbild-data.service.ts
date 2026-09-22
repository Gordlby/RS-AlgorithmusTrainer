import { Injectable, inject, signal } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';
import {
  Krankheitsbild, ExamSection, ExamItem, ExamGroup, EXAM_GROUP_DEFAULTS
} from '../models/krankheitsbild';

const KB_KEY = 'v2-krankheitsbilder';

@Injectable({ providedIn: 'root' })
export class KrankheitsbildDataService {
  private storage = inject(StorageAdapterService);

  readonly liste      = signal<Krankheitsbild[]>([]);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'pending' | 'error'>('idle');

  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  private uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async init(): Promise<void> {
    const str = await this.storage.get(KB_KEY);
    this.liste.set(str ? JSON.parse(str) : []);
  }

  async save(): Promise<void> {
    this.saveStatus.set('saving');
    try {
      await this.storage.set(KB_KEY, JSON.stringify(this.liste()));
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

  // ── Krankheitsbild CRUD ───────────────────────────────────────────────────

  add(): Krankheitsbild {
    const kb: Krankheitsbild = {
      id: this.uid(),
      name: 'Neues Krankheitsbild',
      kategorie: '',
      scenario: '',
      sections: [],
      hinweise: '',
    };
    this.liste.update(l => [...l, kb]);
    return kb;
  }

  update(id: string, changes: Partial<Omit<Krankheitsbild, 'id' | 'sections'>>): void {
    this.liste.update(l => l.map(kb => kb.id === id ? { ...kb, ...changes } : kb));
  }

  remove(id: string): void {
    this.liste.update(l => l.filter(kb => kb.id !== id));
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  addSection(kbId: string, group: ExamGroup): ExamSection {
    const defaults = EXAM_GROUP_DEFAULTS[group];
    const items: ExamItem[] = defaults.map(label => ({ id: this.uid(), label, value: '', iconKey: undefined }));
    const section: ExamSection = { id: this.uid(), group, items };
    this.liste.update(l => l.map(kb => kb.id !== kbId ? kb : {
      ...kb, sections: [...kb.sections, section]
    }));
    return section;
  }

  removeSection(kbId: string, sectionId: string): void {
    this.liste.update(l => l.map(kb => kb.id !== kbId ? kb : {
      ...kb, sections: kb.sections.filter(s => s.id !== sectionId)
    }));
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  addItem(kbId: string, sectionId: string): void {
    const item: ExamItem = { id: this.uid(), label: '', value: '' };
    this.liste.update(l => l.map(kb => kb.id !== kbId ? kb : {
      ...kb, sections: kb.sections.map(s => s.id !== sectionId ? s : {
        ...s, items: [...s.items, item]
      })
    }));
  }

  updateItem(kbId: string, sectionId: string, itemId: string, changes: Partial<ExamItem>): void {
    this.liste.update(l => l.map(kb => kb.id !== kbId ? kb : {
      ...kb, sections: kb.sections.map(s => s.id !== sectionId ? s : {
        ...s, items: s.items.map(it => it.id !== itemId ? it : { ...it, ...changes })
      })
    }));
  }

  removeItem(kbId: string, sectionId: string, itemId: string): void {
    this.liste.update(l => l.map(kb => kb.id !== kbId ? kb : {
      ...kb, sections: kb.sections.map(s => s.id !== sectionId ? s : {
        ...s, items: s.items.filter(it => it.id !== itemId)
      })
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getById(id: string): Krankheitsbild | undefined {
    return this.liste().find(kb => kb.id === id);
  }

  kategorien(): string[] {
    const set = new Set(this.liste().map(kb => kb.kategorie).filter(Boolean));
    return Array.from(set).sort();
  }
}
