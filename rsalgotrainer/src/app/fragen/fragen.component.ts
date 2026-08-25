import { Component, computed, effect, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { QuestionDataService } from '../services/question-data.service';
import { MatchPair, Question, QuestionType } from '../models/question';

type PracticeState = 'picking' | 'checked' | 'done';

interface EditorDragState {
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

interface ChipDragStart {
  itemId: string;
  label: string;
  cx: number;
  cy: number;
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

  // Click-to-select fallback
  selectedDragId = signal<string | null>(null);
  placements     = signal<Record<string, string>>({});

  // ── Match state ───────────────────────────────────────────────────────────────
  matchSelections  = signal<Record<string, string | undefined>>({});
  private _shuffleSeed = signal(Math.random());

  // Pointer-based chip drag (practice)
  practiceDragItem = signal<{ itemId: string; label: string; clientX: number; clientY: number } | null>(null);
  private _chipDragStart: ChipDragStart | null = null;
  private _chipIsDragging = false;
  private _justDropped = false;

  // ── Editor zone drag/resize ──────────────────────────────────────────────────
  private _editorDrag: EditorDragState | null = null;
  private _editorDragMoved = false;
  get editorDragging(): boolean { return !!this._editorDrag; }

  // ── Editor UI ────────────────────────────────────────────────────────────────
  expandedId    = signal<string | null>(null);
  showTypePick  = signal(false);
  showJsonImport = signal(false);
  jsonImportText = signal('');
  jsonImportMsg  = signal('');

  readonly exampleJson = JSON.stringify([
    {
      type: 'single',
      text: 'Was ist die Hauptaufgabe des Herzens?',
      choices: [
        { text: 'Blut durch den Körper pumpen', correct: true },
        { text: 'Sauerstoff produzieren', correct: false },
        { text: 'Nahrung verdauen', correct: false }
      ]
    },
    {
      type: 'multiple',
      text: 'Welche Werte gehören zu den Vitalparametern?',
      choices: [
        { text: 'Puls', correct: true },
        { text: 'Blutdruck', correct: true },
        { text: 'Körpergröße', correct: false },
        { text: 'Atemfrequenz', correct: true }
      ]
    },
    {
      type: 'match',
      text: 'Ordne die Begriffe richtig zu.',
      matchPairs: [
        { left: 'Systole', right: 'Herzmuskel zieht sich zusammen' },
        { left: 'Diastole', right: 'Herzmuskel entspannt sich' },
        { left: 'Herzfrequenz', right: 'Schläge pro Minute' }
      ]
    },
    {
      type: 'dragdrop',
      text: 'Beschrifte die Abbildung. (Bild danach im Editor hochladen)',
      dragItems: [
        { label: 'Begriff A' },
        { label: 'Begriff B' }
      ]
    }
  ], null, 2);

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
      if (q.type === 'match') {
        return q.matchPairs.length >= 2 && q.matchPairs.every(p => p.left.trim() && p.right.trim());
      }
      return q.text.trim().length > 0 && q.choices.length >= 2;
    })
  );

  readonly shuffledMatchOptions = computed((): MatchPair[] => {
    const q = this.currentQ();
    const seed = this._shuffleSeed();
    if (!q || q.type !== 'match') return [];
    const pairs = [...q.matchPairs];
    let s = (seed * 2147483647) | 0;
    for (let i = pairs.length - 1; i > 0; i--) {
      s = Math.imul(s, 1664525) + 1013904223 | 0;
      const j = Math.abs(s) % (i + 1);
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs;
  });

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
    this.practiceDragItem.set(null);
    this._chipDragStart = null;
    this._chipIsDragging = false;
    this.matchSelections.set({});
    this._shuffleSeed.set(Math.random());
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
    } else if (q.type === 'dragdrop') {
      const places = this.placements();
      const ok = q.dropZones.every(dz => places[dz.id] === dz.correctItemId);
      if (ok) this.score.update(s => s + 1);
    } else if (q.type === 'match') {
      const sel = this.matchSelections();
      const ok = q.matchPairs.length > 0 && q.matchPairs.every(p => sel[p.id] === p.id);
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
      this.practiceDragItem.set(null);
      this.matchSelections.set({});
      this._shuffleSeed.set(Math.random());
    }
  }

  // ── Practice chip drag ───────────────────────────────────────────────────────

  onChipPointerDown(e: PointerEvent, itemId: string, label: string): void {
    if (this.practiceState() !== 'picking') return;
    e.preventDefault();
    this._chipDragStart = { itemId, label, cx: e.clientX, cy: e.clientY };
    this._chipIsDragging = false;
  }

  onZoneClick(zoneId: string): void {
    if (this._justDropped) { this._justDropped = false; return; }
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
    this.practiceDragItem.set(null);
  }

  // ── Match methods ─────────────────────────────────────────────────────────────

  onMatchSelect(leftPairId: string, rightPairId: string): void {
    if (this.practiceState() !== 'picking') return;
    this.matchSelections.update(s => ({ ...s, [leftPairId]: rightPairId }));
  }

  resetMatchState(): void {
    this.matchSelections.set({});
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
    if (this._editorDragMoved) { this._editorDragMoved = false; return; }
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

  startZoneDrag(e: PointerEvent, qId: string, zoneId: string, type: 'move' | 'resize', wrap: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    const id = this.fcId();
    if (!id) return;
    const zone = this.qdata.questionsFor(id).find(q => q.id === qId)?.dropZones.find(z => z.id === zoneId);
    if (!zone) return;
    this._editorDrag = {
      type, qId, zoneId,
      startX: e.clientX, startY: e.clientY,
      containerW: rect.width, containerH: rect.height,
      origX: zone.x, origY: zone.y,
      origW: zone.w, origH: zone.h,
    };
    this._editorDragMoved = false;
  }

  // ── Unified pointer move / up ─────────────────────────────────────────────────

  @HostListener('document:pointermove', ['$event'])
  onDocPointerMove(e: PointerEvent): void {

    // Editor zone drag takes priority
    if (this._editorDrag) {
      const dx = ((e.clientX - this._editorDrag.startX) / this._editorDrag.containerW) * 100;
      const dy = ((e.clientY - this._editorDrag.startY) / this._editorDrag.containerH) * 100;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this._editorDragMoved = true;
      const id = this.fcId();
      if (!id) return;
      if (this._editorDrag.type === 'move') {
        const x = Math.max(0, Math.min(100 - this._editorDrag.origW, this._editorDrag.origX + dx));
        const y = Math.max(0, Math.min(100 - this._editorDrag.origH, this._editorDrag.origY + dy));
        this.qdata.patchDropZone(id, this._editorDrag.qId, this._editorDrag.zoneId, { x, y });
      } else {
        const w = Math.max(5, Math.min(95, this._editorDrag.origW + dx));
        const h = Math.max(4, Math.min(50, this._editorDrag.origH + dy));
        this.qdata.patchDropZone(id, this._editorDrag.qId, this._editorDrag.zoneId, { w, h });
      }
      return;
    }

    // Practice chip drag
    if (!this._chipDragStart) return;
    const dx = e.clientX - this._chipDragStart.cx;
    const dy = e.clientY - this._chipDragStart.cy;

    if (!this._chipIsDragging && Math.hypot(dx, dy) > 6) {
      this._chipIsDragging = true;
      const itemId = this._chipDragStart.itemId;
      // Lift out of zone if already placed
      if (this.isItemPlaced(itemId)) {
        const p = { ...this.placements() };
        Object.keys(p).forEach(k => { if (p[k] === itemId) delete p[k]; });
        this.placements.set(p);
      }
      this.selectedDragId.set(null);
    }

    if (this._chipIsDragging) {
      this.practiceDragItem.set({
        itemId: this._chipDragStart.itemId,
        label:  this._chipDragStart.label,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
  }

  @HostListener('document:pointerup', ['$event'])
  onDocPointerUp(e: PointerEvent): void {

    // Editor zone drag
    if (this._editorDrag) {
      this._editorDrag = null;
      return;
    }

    // Practice chip drag
    if (!this._chipDragStart) return;

    if (this._chipIsDragging) {
      // Find zone under pointer (ghost has pointer-events:none so elementFromPoint hits zones)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest('[data-zone-id]') as HTMLElement | null;
      if (zoneEl && this.practiceState() === 'picking') {
        const zoneId = zoneEl.dataset['zoneId'];
        if (zoneId) {
          const itemId = this._chipDragStart.itemId;
          const p = { ...this.placements() };
          Object.keys(p).forEach(k => { if (p[k] === itemId) delete p[k]; });
          p[zoneId] = itemId;
          this.placements.set(p);
          this._justDropped = true;
          setTimeout(() => this._justDropped = false, 100);
        }
      }
      this.practiceDragItem.set(null);
      this._chipIsDragging = false;
    } else {
      // Tap without drag → toggle chip selection
      if (this.practiceState() === 'picking') {
        const itemId = this._chipDragStart.itemId;
        if (this.isItemPlaced(itemId)) {
          const p = { ...this.placements() };
          Object.keys(p).forEach(k => { if (p[k] === itemId) delete p[k]; });
          this.placements.set(p);
          this.selectedDragId.set(itemId);
        } else {
          this.selectedDragId.set(this.selectedDragId() === itemId ? null : itemId);
        }
      }
    }

    this._chipDragStart = null;
  }

  toggleJsonImport(): void {
    this.showJsonImport.update(v => !v);
    this.showTypePick.set(false);
  }

  // ── JSON Import ───────────────────────────────────────────────────────────────

  doJsonImport(): void {
    const id = this.fcId();
    if (!id) return;
    const text = this.jsonImportText().trim();
    if (!text) { this.jsonImportMsg.set('Kein JSON eingegeben.'); return; }

    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { this.jsonImportMsg.set('Fehler: Ungültiges JSON-Format.'); return; }

    if (!Array.isArray(parsed)) {
      this.jsonImportMsg.set('Fehler: JSON muss ein Array sein ([ … ]).');
      return;
    }

    const validTypes = new Set(['single', 'multiple', 'dragdrop', 'match']);
    let added = 0;

    for (const raw of parsed) {
      if (typeof raw !== 'object' || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const type = r['type'] as string;
      if (!validTypes.has(type)) continue;

      const q: Question = {
        id: this.qdata.uid(), type: type as QuestionType,
        text: typeof r['text'] === 'string' ? r['text'] : '',
        image: null, choices: [], dragItems: [], dropZones: [], matchPairs: []
      };

      if ((type === 'single' || type === 'multiple') && Array.isArray(r['choices'])) {
        q.choices = (r['choices'] as Record<string, unknown>[]).map(c => ({
          id: this.qdata.uid(),
          text: typeof c['text'] === 'string' ? c['text'] : '',
          correct: c['correct'] === true
        }));
      }

      if (type === 'match' && Array.isArray(r['matchPairs'])) {
        q.matchPairs = (r['matchPairs'] as Record<string, unknown>[]).map(p => ({
          id: this.qdata.uid(),
          left:  typeof p['left']  === 'string' ? p['left']  : '',
          right: typeof p['right'] === 'string' ? p['right'] : ''
        }));
      }

      if (type === 'dragdrop' && Array.isArray(r['dragItems'])) {
        q.dragItems = (r['dragItems'] as Record<string, unknown>[]).map(d => ({
          id: this.qdata.uid(),
          label: typeof d['label'] === 'string' ? d['label'] : ''
        }));
      }

      this.qdata.sets.update(s => ({ ...s, [id]: [...(s[id] ?? []), q] }));
      added++;
    }

    if (added === 0) {
      this.jsonImportMsg.set('Keine gültigen Fragen gefunden (type prüfen).');
      return;
    }

    this.qdata.persist(id).then();
    this.jsonImportMsg.set(`${added} Frage${added === 1 ? '' : 'n'} importiert ✓`);
    this.jsonImportText.set('');
    setTimeout(() => { this.jsonImportMsg.set(''); this.showJsonImport.set(false); }, 3000);
  }

  typeLabel(type: QuestionType): string {
    const map: Record<QuestionType, string> = {
      single: 'Single Choice',
      multiple: 'Multiple Choice',
      dragdrop: 'Beschriftung',
      match: 'Zuordnen'
    };
    return map[type];
  }
}
