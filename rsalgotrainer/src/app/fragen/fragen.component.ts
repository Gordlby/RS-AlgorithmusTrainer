import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { QuestionDataService } from '../services/question-data.service';
import { Question, QuestionType } from '../models/question';

type PracticeState = 'picking' | 'checked' | 'done';

@Component({
  selector: 'app-fragen',
  imports: [FormsModule],
  templateUrl: './fragen.component.html',
  styleUrl: './fragen.component.scss'
})
export class FragenComponent {
  data  = inject(AlgoDataService);
  auth  = inject(AuthService);
  qdata = inject(QuestionDataService);

  tab = signal<'ueben' | 'bearbeiten'>('ueben');

  // ── Practice ────────────────────────────────────────────────────────────────
  practiceIdx   = signal(0);
  practiceState = signal<PracticeState>('picking');
  score         = signal(0);
  selectedIds   = signal<Set<string>>(new Set());

  // Drag-drop (click-to-select-then-place)
  selectedDragId = signal<string | null>(null);
  placements     = signal<Record<string, string>>({});   // zoneId → itemId

  // ── Editor ──────────────────────────────────────────────────────────────────
  expandedId   = signal<string | null>(null);
  showTypePick = signal(false);

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly fcId = computed(() => this.data.currentId());

  readonly questions = computed(() => {
    const id = this.fcId();
    return id ? this.qdata.questionsFor(id) : [];
  });

  readonly practiceQuestions = computed(() =>
    this.questions().filter(q => {
      if (q.type === 'dragdrop') {
        return !!q.image && q.dropZones.length > 0 && q.dragItems.length > 0;
      }
      return q.text.trim().length > 0 && q.choices.length >= 2;
    })
  );

  readonly currentQ = computed(() =>
    this.practiceQuestions()[this.practiceIdx()] ?? null
  );

  constructor() {
    effect(() => {
      const id = this.fcId();
      if (id) {
        this.qdata.ensureLoaded(id).then();
        this.resetPractice();
      }
    });
  }

  // ── Practice methods ─────────────────────────────────────────────────────────

  resetPractice(): void {
    this.practiceIdx.set(0);
    this.practiceState.set('picking');
    this.score.set(0);
    this.selectedIds.set(new Set());
    this.selectedDragId.set(null);
    this.placements.set({});
  }

  toggleChoice(choiceId: string): void {
    const q = this.currentQ();
    if (!q || this.practiceState() !== 'picking') return;
    if (q.type === 'single') {
      this.selectedIds.set(new Set([choiceId]));
    } else {
      const s = new Set(this.selectedIds());
      s.has(choiceId) ? s.delete(choiceId) : s.add(choiceId);
      this.selectedIds.set(s);
    }
  }

  checkAnswer(): void {
    const q = this.currentQ();
    if (!q) return;
    this.practiceState.set('checked');
    if (q.type === 'single' || q.type === 'multiple') {
      const correctIds = new Set(q.choices.filter(c => c.correct).map(c => c.id));
      const sel = this.selectedIds();
      const ok = correctIds.size === sel.size && [...correctIds].every(id => sel.has(id));
      if (ok) this.score.update(s => s + 1);
    } else {
      const places = this.placements();
      const ok = q.dropZones.every(dz => places[dz.id] === dz.correctItemId);
      if (ok) this.score.update(s => s + 1);
    }
  }

  nextQuestion(): void {
    const next = this.practiceIdx() + 1;
    if (next >= this.practiceQuestions().length) {
      this.practiceState.set('done');
    } else {
      this.practiceIdx.set(next);
      this.practiceState.set('picking');
      this.selectedIds.set(new Set());
      this.selectedDragId.set(null);
      this.placements.set({});
    }
  }

  // ── Drag-drop practice ────────────────────────────────────────────────────────

  onDragItemClick(itemId: string): void {
    if (this.practiceState() !== 'picking') return;
    if (this.isItemPlaced(itemId)) {
      const p = { ...this.placements() };
      Object.keys(p).forEach(k => { if (p[k] === itemId) delete p[k]; });
      this.placements.set(p);
      this.selectedDragId.set(itemId);
    } else {
      this.selectedDragId.set(this.selectedDragId() === itemId ? null : itemId);
    }
  }

  onZoneClick(zoneId: string): void {
    if (this.practiceState() !== 'picking') return;
    const itemId = this.selectedDragId();
    if (itemId) {
      const p = { ...this.placements() };
      Object.keys(p).forEach(k => { if (p[k] === itemId) delete p[k]; });
      p[zoneId] = itemId;
      this.placements.set(p);
      this.selectedDragId.set(null);
    } else {
      const p = { ...this.placements() };
      delete p[zoneId];
      this.placements.set(p);
    }
  }

  isItemPlaced(itemId: string): boolean {
    return Object.values(this.placements()).includes(itemId);
  }

  getDragItemLabel(q: Question, itemId: string | null | undefined): string {
    if (!itemId) return '';
    return q.dragItems.find(di => di.id === itemId)?.label ?? '';
  }

  resetDragDrop(): void {
    this.placements.set({});
    this.selectedDragId.set(null);
  }

  // ── Editor methods ────────────────────────────────────────────────────────────

  addQuestion(type: QuestionType): void {
    const id = this.fcId();
    if (!id) return;
    const qId = this.qdata.addQuestion(id, type);
    this.expandedId.set(qId);
    this.showTypePick.set(false);
  }

  deleteQuestion(qId: string): void {
    const id = this.fcId();
    if (!id || !confirm('Frage löschen?')) return;
    this.qdata.deleteQuestion(id, qId);
    if (this.expandedId() === qId) this.expandedId.set(null);
  }

  toggleExpand(qId: string): void {
    this.expandedId.set(this.expandedId() === qId ? null : qId);
  }

  onImageUpload(event: Event, qId: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const id = this.fcId();
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        this.qdata.patchQuestion(id, qId, { image: compressed });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  onImageClick(event: MouseEvent, qId: string): void {
    const id = this.fcId();
    if (!id) return;
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
    this.qdata.addDropZone(id, qId, x, y);
  }

  typeLabel(type: QuestionType): string {
    const map: Record<QuestionType, string> = {
      single: 'Single Choice',
      multiple: 'Multiple Choice',
      dragdrop: 'Beschriftung'
    };
    return map[type];
  }
}
