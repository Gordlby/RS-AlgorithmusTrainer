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
    if (m === 'facts-reveal') this.resetFactsReveal();
    else this.buildQuiz();
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
  factNodeIdx       = signal(0);
  factInput         = signal('');
  noMatch           = signal(false);
  revealedFacts     = signal<Set<string>>(new Set());  // "nodeId:factIndex"
  randomFacts       = signal(false);
  shuffledFactIndices = signal<number[]>([]);

  get factInputStr(): string { return this.factInput(); }
  set factInputStr(v: string) { this.factInput.set(v); }

  factNodes = computed(() => {
    const fc = this.data.currentFc();
    if (!fc) return [];
    return fc.nodes.filter(n => (n.facts ?? []).some(f => f.trim()));
  });

  currentFactNode = computed(() => this.factNodes()[this.factNodeIdx()] ?? null);

  private buildShuffledIndices(): void {
    const node = this.currentFactNode();
    if (!node) { this.shuffledFactIndices.set([]); return; }
    const indices = (node.facts ?? []).map((f, i) => ({ f, i })).filter(x => x.f.trim()).map(x => x.i);
    if (this.randomFacts()) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    this.shuffledFactIndices.set(indices);
  }

  toggleRandomFacts(): void {
    this.randomFacts.update(v => !v);
    this.buildShuffledIndices();
  }

  factKey(nodeId: string, idx: number): string { return `${nodeId}:${idx}`; }

  isFactRevealed(nodeId: string, idx: number): boolean {
    return this.revealedFacts().has(this.factKey(nodeId, idx));
  }

  revealedCountFor(node: FlowchartNode): number {
    return (node.facts ?? []).filter((f, i) => f.trim() && this.isFactRevealed(node.id, i)).length;
  }

  totalFactsFor(node: FlowchartNode): number {
    return (node.facts ?? []).filter(f => f.trim()).length;
  }

  allFactsRevealed = computed(() => {
    const n = this.currentFactNode();
    if (!n) return false;
    return this.revealedCountFor(n) >= this.totalFactsFor(n);
  });

  onFactEnter(): void {
    const node = this.currentFactNode();
    if (!node || this.allFactsRevealed()) return;
    const input = this.factInput().trim();
    if (!input) return;

    // Find first unrevealed fact with ≥70% bigram similarity
    const facts = (node.facts ?? []);
    let matchIdx = -1;
    for (let i = 0; i < facts.length; i++) {
      if (!facts[i].trim() || this.isFactRevealed(node.id, i)) continue;
      if (this.factSimilarity(input, facts[i]) >= 0.7) { matchIdx = i; break; }
    }

    if (matchIdx >= 0) {
      const s = new Set(this.revealedFacts());
      s.add(this.factKey(node.id, matchIdx));
      this.revealedFacts.set(s);
      this.factInput.set('');
      this.noMatch.set(false);
    } else {
      this.noMatch.set(true);
      setTimeout(() => this.noMatch.set(false), 1500);
    }
  }

  revealAllCurrentFacts(): void {
    const node = this.currentFactNode();
    if (!node) return;
    const s = new Set(this.revealedFacts());
    (node.facts ?? []).forEach((f, i) => { if (f.trim()) s.add(this.factKey(node.id, i)); });
    this.revealedFacts.set(s);
  }

  nextFactNode(): void {
    this.factNodeIdx.update(i => Math.min(i + 1, this.factNodes().length - 1));
    this.factInput.set('');
    this.noMatch.set(false);
    this.buildShuffledIndices();
  }

  resetFactsReveal(): void {
    this.factNodeIdx.set(0);
    this.factInput.set('');
    this.revealedFacts.set(new Set());
    this.noMatch.set(false);
    this.buildShuffledIndices();
  }

  nodeColor(n: FlowchartNode): string { return n.color || 'var(--lime)'; }

  private norm(s: string): string {
    return s.toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private factSimilarity(input: string, fact: string): number {
    const a = this.norm(input);
    const b = this.norm(fact);
    if (!a || !b) return 0;
    // Bigram Sørensen–Dice coefficient
    const bigrams = (str: string) => {
      const bg = new Map<string, number>();
      for (let i = 0; i < str.length - 1; i++) {
        const k = str.slice(i, i + 2);
        bg.set(k, (bg.get(k) ?? 0) + 1);
      }
      return bg;
    };
    const aB = bigrams(a), bB = bigrams(b);
    let inter = 0;
    aB.forEach((cnt, k) => { inter += Math.min(cnt, bB.get(k) ?? 0); });
    const total = (a.length - 1) + (b.length - 1);
    if (total <= 0) return a === b ? 1 : 0;
    return (2 * inter) / total;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  get hasEnoughNodes(): boolean {
    return (this.data.currentFc()?.nodes.length ?? 0) >= 2;
  }

  get factOrderEligible(): boolean {
    return (this.data.currentFc()?.nodes ?? [])
      .some(n => (n.facts ?? []).filter(f => f.trim()).length >= 2);
  }
}
