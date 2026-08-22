import { Component, computed, effect, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { QuestionDataService } from '../services/question-data.service';
import { Question, QuestionType } from '../models/question';

type PracticeState = 'picking' | 'checked' | 'done';

interface DragState {
  type: 'move' | 'resize';
  qId: string;
  zoneId: string;
  startX: number;
  startY: number;
  containerW: number;
  containerH: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

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

  // ── Zone drag/resize ────────────────────────────────────────────────────────
  private _drag: DragState | null = null;
  private _dragMoved = false;
  get dragging(): boolean { return !!this._drag; }

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

  onImageClick(event: MouseEvent, qId: string, wrap: HTMLElement): void {
    if (this._dragMoved) { this._dragMoved = false; return; }
    const id = this.fcId();
    if (!id) return;
    const rect = wrap.getBoundingClientRect();
    const W = 15, H = 8;
    const cx = Math.round(((event.clientX - rect.left) / rect.width)  * 1000) / 10;
    const cy = Math.round(((event.clientY - rect.top)  / rect.height) * 1000) / 10;
    const x = Math.max(0, Math.min(100 - W, cx - W / 2));
    const y = Math.max(0, Math.min(100 - H, cy - H / 2));
    this.qdata.addDropZone(id, qId, x, y);
  }

  // ── Zone drag / resize (editor) ───────────────────────────────────────────────

  startZoneDrag(e: MouseEvent | TouchEvent, qId: string, zoneId: string, type: 'move' | 'resize', wrap: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    const cx = e instanceof MouseEvent ? e.clientX : (e as TouchEvent).touches[0].clientX;
    const cy = e instanceof MouseEvent ? e.clientY : (e as TouchEvent).touches[0].clientY;
    const id = this.fcId();
    if (!id) return;
    const zone = this.qdata.questionsFor(id).find(q => q.id === qId)?.dropZones.find(z => z.id === zoneId);
    if (!zone) return;
    this._drag = {
      type, qId, zoneId,
      startX: cx, startY: cy,
      containerW: rect.width, containerH: rect.height,
      origX: zone.x, origY: zone.y,
      origW: zone.w, origH: zone.h,
    };
    this._dragMoved = false;
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDocMove(e: MouseEvent | TouchEvent): void {
    if (!this._drag) return;
    const cx = e instanceof MouseEvent ? e.clientX : (e as TouchEvent).touches[0].clientX;
    const cy = e instanceof MouseEvent ? e.clientY : (e as TouchEvent).touches[0].clientY;
    const dx = ((cx - this._drag.startX) / this._drag.containerW) * 100;
    const dy = ((cy - this._drag.startY) / this._drag.containerH) * 100;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this._dragMoved = true;
    const id = this.fcId();
    if (!id) return;
    if (this._drag.type === 'move') {
      const x = Math.max(0, Math.min(100 - this._drag.origW, this._drag.origX + dx));
      const y = Math.max(0, Math.min(100 - this._drag.origH, this._drag.origY + dy));
      this.qdata.patchDropZone(id, this._drag.qId, this._drag.zoneId, { x, y });
    } else {
      const w = Math.max(5, Math.min(95, this._drag.origW + dx));
      const h = Math.max(4, Math.min(50, this._drag.origH + dy));
      this.qdata.patchDropZone(id, this._drag.qId, this._drag.zoneId, { w, h });
    }
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  onDocUp(): void {
    this._drag = null;
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
