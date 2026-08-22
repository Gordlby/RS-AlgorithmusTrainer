import { Injectable, inject, signal } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';
import { Choice, DragItem, DropZone, Question, QuestionType } from '../models/question';

const QSET_KEY = (fcId: string) => `v2-qset:${fcId}`;

@Injectable({ providedIn: 'root' })
export class QuestionDataService {
  private storage = inject(StorageAdapterService);

  readonly sets      = signal<Record<string, Question[]>>({});
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'pending' | 'error'>('idle');

  private saveTimer:   ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  questionsFor(fcId: string): Question[] {
    return this.sets()[fcId] ?? [];
  }

  async ensureLoaded(fcId: string): Promise<void> {
    if (fcId in this.sets()) return;
    const str = await this.storage.get(QSET_KEY(fcId));
    const questions: Question[] = str ? JSON.parse(str) : [];
    this.sets.update(s => ({ ...s, [fcId]: questions }));
  }

  private scheduleSave(fcId: string): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveStatus.set('saving');
    this.saveTimer = setTimeout(() => this.persist(fcId), 500);
  }

  async persist(fcId: string): Promise<void> {
    const questions = this.sets()[fcId];
    if (questions === undefined) return;
    try {
      await this.storage.set(QSET_KEY(fcId), JSON.stringify(questions));
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

  // ── Questions ───────────────────────────────────────────────────────────────

  addQuestion(fcId: string, type: QuestionType): string {
    const q: Question = {
      id: this.uid(), type, text: '',
      image: null, choices: [], dragItems: [], dropZones: []
    };
    if (type === 'single' || type === 'multiple') {
      q.choices = [
        { id: this.uid(), text: '', correct: true  },
        { id: this.uid(), text: '', correct: false },
      ];
    }
    this.sets.update(s => ({ ...s, [fcId]: [...(s[fcId] ?? []), q] }));
    this.scheduleSave(fcId);
    return q.id;
  }

  deleteQuestion(fcId: string, qId: string): void {
    this.sets.update(s => ({ ...s, [fcId]: (s[fcId] ?? []).filter(q => q.id !== qId) }));
    this.scheduleSave(fcId);
  }

  patchQuestion(fcId: string, qId: string, changes: Partial<Question>): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q => q.id === qId ? { ...q, ...changes } : q)
    }));
    this.scheduleSave(fcId);
  }

  // ── Choices ─────────────────────────────────────────────────────────────────

  addChoice(fcId: string, qId: string): void {
    const choice: Choice = { id: this.uid(), text: '', correct: false };
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id === qId ? { ...q, choices: [...q.choices, choice] } : q
      )
    }));
    this.scheduleSave(fcId);
  }

  setCorrectChoice(fcId: string, qId: string, choiceId: string, correct: boolean): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q => {
        if (q.id !== qId) return q;
        const choices = q.type === 'single'
          ? q.choices.map(c => ({ ...c, correct: c.id === choiceId }))
          : q.choices.map(c => c.id === choiceId ? { ...c, correct } : c);
        return { ...q, choices };
      })
    }));
    this.scheduleSave(fcId);
  }

  patchChoiceText(fcId: string, qId: string, choiceId: string, text: string): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : {
          ...q,
          choices: q.choices.map(c => c.id === choiceId ? { ...c, text } : c)
        }
      )
    }));
    this.scheduleSave(fcId);
  }

  deleteChoice(fcId: string, qId: string, choiceId: string): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : { ...q, choices: q.choices.filter(c => c.id !== choiceId) }
      )
    }));
    this.scheduleSave(fcId);
  }

  // ── Drag items ──────────────────────────────────────────────────────────────

  addDragItem(fcId: string, qId: string): void {
    const item: DragItem = { id: this.uid(), label: '' };
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id === qId ? { ...q, dragItems: [...q.dragItems, item] } : q
      )
    }));
    this.scheduleSave(fcId);
  }

  patchDragItem(fcId: string, qId: string, itemId: string, label: string): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : {
          ...q,
          dragItems: q.dragItems.map(di => di.id === itemId ? { ...di, label } : di)
        }
      )
    }));
    this.scheduleSave(fcId);
  }

  deleteDragItem(fcId: string, qId: string, itemId: string): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : {
          ...q,
          dragItems: q.dragItems.filter(di => di.id !== itemId),
          dropZones: q.dropZones.map(dz =>
            dz.correctItemId === itemId ? { ...dz, correctItemId: null } : dz
          )
        }
      )
    }));
    this.scheduleSave(fcId);
  }

  // ── Drop zones ──────────────────────────────────────────────────────────────

  addDropZone(fcId: string, qId: string, x: number, y: number): void {
    const zone: DropZone = { id: this.uid(), x, y, correctItemId: null };
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id === qId ? { ...q, dropZones: [...q.dropZones, zone] } : q
      )
    }));
    this.scheduleSave(fcId);
  }

  patchDropZone(fcId: string, qId: string, zoneId: string, changes: Partial<DropZone>): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : {
          ...q,
          dropZones: q.dropZones.map(dz => dz.id === zoneId ? { ...dz, ...changes } : dz)
        }
      )
    }));
    this.scheduleSave(fcId);
  }

  deleteDropZone(fcId: string, qId: string, zoneId: string): void {
    this.sets.update(s => ({
      ...s,
      [fcId]: (s[fcId] ?? []).map(q =>
        q.id !== qId ? q : { ...q, dropZones: q.dropZones.filter(dz => dz.id !== zoneId) }
      )
    }));
    this.scheduleSave(fcId);
  }
}
