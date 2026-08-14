import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlgoDataService } from '../services/algo-data.service';
import { Flowchart, FlowchartNode } from '../models/flowchart';

export type QuizMode = 'connections' | 'factorder' | 'match' | 'facts-reveal';

interface Option { id: string; label: string; }
interface QuizQuestion {
  prompt: string;
  options: Option[];
  correctId: string;
}
interface OrderItem { text: string; originalIndex: number; }

@Component({
  selector: 'app-algoquiz',
  imports: [FormsModule],
  templateUrl: './algoquiz.component.html',
  styleUrl: './algoquiz.component.scss'
})
export class AlgoquizComponent implements OnInit {
  data = inject(AlgoDataService);

  mode = signal<QuizMode>('connections');

  // Shared state
  score   = signal(0);
  idx     = signal(0);
  answered = signal(false);
  selectedOptionId = signal<string | null>(null);
  finished = signal(false);

  // Connections / Match quiz
  questions = signal<QuizQuestion[]>([]);

  // Fact-order quiz
  orderNode   = signal<FlowchartNode | null>(null);
  orderItems  = signal<OrderItem[]>([]);
  orderResult = signal<string | null>(null);
  orderCorrect = signal<boolean | null>(null);
  private originalFacts: string[] = [];

  // Drag state for order quiz
  private dragOrderIdx: number | null = null;

  ngOnInit(): void { this.buildQuiz(); }

  setMode(m: QuizMode): void {
    this.mode.set(m);
    this.buildQuiz();
  }

  buildQuiz(): void {
    this.score.set(0);
    this.idx.set(0);
    this.answered.set(false);
    this.selectedOptionId.set(null);
    this.finished.set(false);
    this.orderResult.set(null);
    this.orderCorrect.set(null);

    const fc = this.data.currentFc();
    if (!fc) return;

    if (this.mode() === 'connections') this.buildConnectionsQuiz(fc);
    else if (this.mode() === 'match')   this.buildMatchQuiz(fc);
    else                                this.buildFactOrderQuiz(fc);
  }

  // ─── Connections Quiz ─────────────────────────────────────────────────────
  private buildConnectionsQuiz(fc: Flowchart): void {
    const pool: QuizQuestion[] = [];
    fc.nodes.forEach(n => {
      (n.branches ?? []).forEach(b => {
        if (!b.targetId) return;
        const prompt = n.type === 'decision'
          ? `Bei „${n.text}" – wohin führt „${b.label || '?'}"?`
          : `Wie geht es nach „${n.text}" weiter?`;
        const correctNode = fc.nodes.find(x => x.id === b.targetId)!;
        if (!correctNode) return;
        const distractors = fc.nodes
          .filter(x => x.id !== n.id && x.id !== b.targetId)
          .sort(() => Math.random() - .5)
          .slice(0, 3);
        const options = [correctNode, ...distractors]
          .sort(() => Math.random() - .5)
          .map(o => ({ id: o.id, label: this.data.nodeLabel(fc, o.id) }));
        pool.push({ prompt, options, correctId: b.targetId! });
      });
    });
    this.questions.set(pool.sort(() => Math.random() - .5).slice(0, 10));
  }

  // ─── Match Quiz ───────────────────────────────────────────────────────────
  private buildMatchQuiz(fc: Flowchart): void {
    const pool: QuizQuestion[] = [];
    fc.nodes.forEach(n => {
      (n.facts ?? []).filter(f => f.trim()).forEach(f => {
        const distractors = fc.nodes.filter(x => x.id !== n.id).sort(() => Math.random() - .5).slice(0, 3);
        const options = [n, ...distractors]
          .sort(() => Math.random() - .5)
          .map(o => ({ id: o.id, label: this.data.nodeLabel(fc, o.id) }));
        pool.push({ prompt: `Zu welchem Knoten gehört: „${f}"?`, options, correctId: n.id });
      });
    });
    this.questions.set(pool.sort(() => Math.random() - .5).slice(0, 10));
  }

  // ─── Fact-Order Quiz ──────────────────────────────────────────────────────
  private buildFactOrderQuiz(fc: Flowchart): void {
    const eligible = fc.nodes.filter(n => (n.facts ?? []).filter(f => f.trim()).length >= 2);
    if (eligible.length === 0) { this.questions.set([]); return; }
    const node = eligible[Math.floor(Math.random() * eligible.length)];
    this.originalFacts = node.facts.filter(f => f.trim());
    const shuffled = [...this.originalFacts]
      .map((text, originalIndex) => ({ text, originalIndex }))
      .sort(() => Math.random() - .5);
    this.orderNode.set(node);
    this.orderItems.set(shuffled);
  }

  nextFactOrder(): void {
    const fc = this.data.currentFc();
    if (fc) this.buildFactOrderQuiz(fc);
  }

  checkOrder(): void {
    const items = this.orderItems();
    const correct = items.every((item, i) => item.originalIndex === i);
    this.orderCorrect.set(correct);
    if (correct) this.score.update(s => s + 1);
    this.orderResult.set(
      correct ? 'Richtig!' : 'Noch nicht ganz. Richtige Reihenfolge: ' + this.originalFacts.join(' → ')
    );
  }

  // ─── Connections / Match shared ───────────────────────────────────────────
  get currentQuestion(): QuizQuestion | null {
    return this.questions()[this.idx()] ?? null;
  }

  answer(optionId: string): void {
    if (this.answered()) return;
    this.answered.set(true);
    this.selectedOptionId.set(optionId);
    if (optionId === this.currentQuestion?.correctId) {
      this.score.update(s => s + 1);
    }
  }

  next(): void {
    const nextIdx = this.idx() + 1;
    if (nextIdx >= this.questions().length) {
      this.finished.set(true);
    } else {
      this.idx.set(nextIdx);
      this.answered.set(false);
      this.selectedOptionId.set(null);
    }
  }

  optionClass(id: string): string {
    if (!this.answered()) return '';
    if (id === this.currentQuestion?.correctId) return 'correct';
    if (id === this.selectedOptionId()) return 'wrong';
    return '';
  }

  // ─── Order drag & drop ────────────────────────────────────────────────────
  onOrderDragStart(index: number): void { this.dragOrderIdx = index; }

  onOrderDragOver(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    if (this.dragOrderIdx === null || this.dragOrderIdx === targetIndex) return;
    const items = [...this.orderItems()];
    const [moved] = items.splice(this.dragOrderIdx, 1);
    items.splice(targetIndex, 0, moved);
    this.dragOrderIdx = targetIndex;
    this.orderItems.set(items);
  }

  onOrderDragEnd(): void { this.dragOrderIdx = null; }

  // ─── Facts-Reveal mode ────────────────────────────────────────────────────
  searchQuery = signal('');
  get searchQueryStr(): string { return this.searchQuery(); }
  set searchQueryStr(v: string) { this.searchQuery.set(v); }
  revealedIds = signal<Set<string>>(new Set());

  factNodes = computed(() => {
    const fc = this.data.currentFc();
    if (!fc) return [];
    return fc.nodes.filter(n => (n.facts ?? []).some(f => f.trim()));
  });

  filteredFactNodes = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.factNodes();
    const terms = q.split(/\s+/);
    return this.factNodes().filter(n => {
      const hay = (n.text + ' ' + (n.key ?? '')).toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  });

  isRevealed(nodeId: string): boolean { return this.revealedIds().has(nodeId); }

  toggleReveal(nodeId: string): void {
    const s = new Set(this.revealedIds());
    s.has(nodeId) ? s.delete(nodeId) : s.add(nodeId);
    this.revealedIds.set(s);
  }

  revealAll(): void {
    this.revealedIds.set(new Set(this.filteredFactNodes().map(n => n.id)));
  }

  resetReveal(): void { this.revealedIds.set(new Set()); }

  nodeColor(n: FlowchartNode): string { return n.color || 'var(--lime)'; }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  get hasEnoughNodes(): boolean {
    return (this.data.currentFc()?.nodes.length ?? 0) >= 2;
  }

  get factOrderEligible(): boolean {
    return (this.data.currentFc()?.nodes ?? [])
      .some(n => (n.facts ?? []).filter(f => f.trim()).length >= 2);
  }
}
