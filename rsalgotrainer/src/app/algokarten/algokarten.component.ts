import { Component, inject, signal, computed } from '@angular/core';
import { AlgoDataService } from '../services/algo-data.service';
import { FlowchartNode } from '../models/flowchart';

@Component({
  selector: 'app-algokarten',
  imports: [],
  templateUrl: './algokarten.component.html',
  styleUrl: './algokarten.component.scss'
})
export class AlgokartenComponent {
  data = inject(AlgoDataService);

  cardIdx  = signal(0);
  showBack = signal(false);

  readonly currentNode = computed<FlowchartNode | null>(() => {
    const fc = this.data.currentFc();
    if (!fc || fc.nodes.length === 0) return null;
    const idx = this.cardIdx() % fc.nodes.length;
    return fc.nodes[idx];
  });

  readonly total = computed(() => this.data.currentFc()?.nodes.length ?? 0);

  flip(): void { this.showBack.update(v => !v); }

  prev(): void {
    this.showBack.set(false);
    this.cardIdx.update(i => (i - 1 + this.total()) % this.total());
  }

  next(): void {
    this.showBack.set(false);
    this.cardIdx.update(i => (i + 1) % this.total());
  }

  shuffle(): void {
    this.showBack.set(false);
    this.cardIdx.set(Math.floor(Math.random() * this.total()));
  }

  branchInfo(node: FlowchartNode): string[] {
    const fc = this.data.currentFc();
    if (!fc) return [];
    const lines: string[] = [];
    if (node.type === 'decision') {
      (node.branches ?? []).forEach(b => {
        lines.push(`${b.label || '—'} → ${b.targetId ? this.data.nodeLabel(fc, b.targetId) : 'Ende'}`);
      });
    } else if (node.type !== 'end') {
      const b = node.branches?.[0];
      lines.push(`Weiter → ${b?.targetId ? this.data.nodeLabel(fc, b.targetId) : 'Ende'}`);
    }
    if (node.type === 'link') {
      const t = this.data.flowcharts()[node.linkedFlowchartId ?? ''];
      lines.push(`Verweist auf: ${t?.title ?? '(gelöscht)'}`);
    }
    return lines;
  }
}
