import {
  Component, inject, effect, ViewChild, ElementRef, signal
} from '@angular/core';
import { AlgoDataService } from '../services/algo-data.service';
import { Flowchart, FlowchartNode, NodeType } from '../models/flowchart';
import { computeLayout, CELL_W, CELL_H, BRANCH_COLORS } from './layout.utils';

function escHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] ?? m));
}

// Fixed node dimensions – must match CSS
const NODE_W: Record<NodeType, number> = {
  start: 170, end: 170, process: 190, link: 190, decision: 200
};
const NODE_H: Record<NodeType, number> = {
  start: 52, end: 52, process: 52, link: 52, decision: 120
};

// Horizontal padding so left-side arrows have breathing room
const OFFSET_X = 80;

@Component({
  selector: 'app-flowchart',
  imports: [],
  templateUrl: './flowchart.component.html',
  styleUrl: './flowchart.component.scss'
})
export class FlowchartComponent {
  data = inject(AlgoDataService);

  @ViewChild('flowSvg') svgRef?: ElementRef<SVGSVGElement>;

  selectedNode = signal<FlowchartNode | null>(null);

  constructor() {
    effect(() => {
      this.data.currentFc();
      this.selectedNode.set(null);
      setTimeout(() => this.drawEdges(), 0);
    });
  }

  get fc(): Flowchart | null { return this.data.currentFc(); }

  get layoutNodes(): { node: FlowchartNode; left: number; top: number }[] {
    const fc = this.fc;
    if (!fc || fc.nodes.length === 0) return [];
    const { positions } = computeLayout(fc);
    return fc.nodes
      .filter(n => positions[n.id])
      .map(n => ({
        node: n,
        left: positions[n.id].col * CELL_W + CELL_W / 2 + OFFSET_X,
        top:  positions[n.id].row * CELL_H + 30,
      }));
  }

  get canvasSize(): { width: number; height: number } {
    const fc = this.fc;
    if (!fc || fc.nodes.length === 0) return { width: 500, height: 300 };
    const { maxRow, maxCol } = computeLayout(fc);
    return {
      width:  Math.max(500, OFFSET_X + (maxCol + 1) * CELL_W + OFFSET_X),
      height: (maxRow + 1) * CELL_H + 80,
    };
  }

  selectNode(node: FlowchartNode): void { this.selectedNode.set(node); }
  openLinkedFc(id: string): void { this.data.selectFlowchart(id); }

  nodeLabel(id: string): string {
    const fc = this.fc;
    return fc ? this.data.nodeLabel(fc, id) : '?';
  }

  nextLabel(node: FlowchartNode): string {
    const targetId = node.branches.length > 0 ? node.branches[0].targetId : null;
    return targetId ? '→ ' + this.nodeLabel(targetId) : 'Ende';
  }

  linkedFcTitle(linkedId: string | null): string {
    if (!linkedId) return '(gelöscht)';
    return this.data.flowcharts()[linkedId]?.title ?? '(gelöscht)';
  }

  // ─── SVG Edge Drawing ─────────────────────────────────────────────────────

  private nodeCenter(pos: { row: number; col: number }, type: NodeType): { cx: number; cy: number; lx: number; rx: number; ty: number; by: number } {
    const w = NODE_W[type] ?? 190;
    const h = NODE_H[type] ?? 52;
    const cx = pos.col * CELL_W + CELL_W / 2 + OFFSET_X;
    const topY = pos.row * CELL_H + 30;
    return {
      cx,
      cy: topY + h / 2,   // Mitte Y
      lx: cx - w / 2,     // linker Rand
      rx: cx + w / 2,     // rechter Rand
      ty: topY,           // obere Kante
      by: topY + h,       // untere Kante
    };
  }

  private drawEdges(): void {
    const svg = this.svgRef?.nativeElement;
    const fc  = this.fc;
    if (!svg || !fc || fc.nodes.length === 0) return;

    const { positions, branchWaypoints } = computeLayout(fc);

    // Pfeilspitzen-Definitionen
    let defs = '<defs>';
    BRANCH_COLORS.forEach((c, i) => {
      defs += `<marker id="arr${i}" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,1 L9,5 L0,9z" fill="${c}"/></marker>`;
    });
    defs += `<marker id="arr-plain" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9z" fill="#5c7168"/></marker></defs>`;

    // ── Ankerpunkte am Ziel vorberechnen ─────────────────────────────────────
    // Mehrere Pfeile an einem Ziel → gleichmäßig auf der Oberkante verteilen,
    // sortiert nach Quell-Spalte (links kommt links an, rechts kommt rechts an).
    const arrivalsAt = new Map<string, { srcId: string; bid: string }[]>();
    fc.nodes.forEach(n => {
      const nPos = positions[n.id];
      if (!nPos) return;
      (n.branches ?? []).forEach(b => {
        if (!b.targetId || !positions[b.targetId]) return;
        if (!arrivalsAt.has(b.targetId)) arrivalsAt.set(b.targetId, []);
        arrivalsAt.get(b.targetId)!.push({ srcId: n.id, bid: b.id });
      });
    });
    arrivalsAt.forEach(list => {
      list.sort((a, z) => (positions[a.srcId]?.col ?? 0) - (positions[z.srcId]?.col ?? 0));
    });

    let paths = '';

    fc.nodes.forEach(srcNode => {
      const srcPos = positions[srcNode.id];
      if (!srcPos) return;

      const src = this.nodeCenter(srcPos, srcNode.type);

      const activeBranches = (srcNode.branches ?? []).filter(
        b => b.targetId && positions[b.targetId]
      );
      const total = activeBranches.length;
      if (total === 0) return;

      const multi   = total > 1;
      const isDecision = srcNode.type === 'decision';

      // Für Decision-Knoten: Zweige nach Ziel-Spalte sortieren →
      // Linkester Zweig → linker Ausgang, Rechtester → rechter Ausgang
      const sorted = isDecision && total > 1
        ? [...activeBranches].sort((a, b) =>
            (positions[a.targetId!]?.col ?? 0) - (positions[b.targetId!]?.col ?? 0))
        : activeBranches;

      activeBranches.forEach((b, bi) => {
        const tgtPos = positions[b.targetId!]!;
        const tgtType = (fc.nodes.find(n => n.id === b.targetId)?.type ?? 'process') as NodeType;
        const tgt = this.nodeCenter(tgtPos, tgtType);

        const stroke = multi ? BRANCH_COLORS[bi % BRANCH_COLORS.length] : '#5c7168';
        const marker = multi ? `url(#arr${bi % BRANCH_COLORS.length})` : 'url(#arr-plain)';

        // ── Ausgangs-Punkt und Richtung bestimmen ───────────────────────────
        // Richtung basiert auf tatsächlichem Spalten-Unterschied zum Ziel.
        // Gleiche Spalte oder kein Decision → immer unten.
        let sx: number, sy: number, dir: 'down' | 'left' | 'right';

        const srcCol = srcPos.col;
        const tgtCol = tgtPos.col;
        const colDiff = tgtCol - srcCol;

        if (isDecision && total >= 2 && Math.abs(colDiff) > 0.1) {
          // Ziel ist tatsächlich links oder rechts der Quelle
          if (colDiff < 0) { sx = src.lx; sy = src.cy; dir = 'left'; }
          else              { sx = src.rx; sy = src.cy; dir = 'right'; }

          // Mehrere Zweige in die gleiche Richtung → Y versetzen
          const sameDir = activeBranches.filter(bb => {
            const d = (positions[bb.targetId!]?.col ?? srcCol) - srcCol;
            return colDiff < 0 ? d < -0.1 : d > 0.1;
          });
          if (sameDir.length > 1) {
            const idx = sameDir.indexOf(b);
            sy = src.cy + (idx - (sameDir.length - 1) / 2) * 22;
          }
        } else {
          // Gleiches Spalte oder Non-Decision → unten, mit Slot
          const downBranches = isDecision
            ? activeBranches.filter(bb =>
                Math.abs((positions[bb.targetId!]?.col ?? srcCol) - srcCol) <= 0.1)
            : activeBranches;
          const dIdx  = downBranches.indexOf(b);
          const dTotal = downBranches.length;
          const slot = dTotal > 1 ? (dIdx + 1) / (dTotal + 1) : 0.5;
          const nw = NODE_W[srcNode.type] ?? 190;
          sx = src.cx - nw / 2 + nw * slot;
          sy = src.by; dir = 'down';
        }

        // Ankerpunkt am Ziel: bei mehreren Pfeilen gleichmäßig auf Oberkante verteilen
        const arrivals = arrivalsAt.get(b.targetId!) ?? [];
        const arrIdx   = arrivals.findIndex(a => a.bid === b.id);
        const arrTotal = arrivals.length;
        const tgtW     = NODE_W[tgtType] ?? 190;
        const arrSlot  = arrTotal > 1 ? (arrIdx + 1) / (arrTotal + 1) : 0.5;
        const tx = tgt.cx - tgtW / 2 + tgtW * arrSlot;
        const ty = tgt.ty;   // Oberkante des Ziel-Knotens

        // Waypoints nur für 'down'-Richtung verwenden
        const waypoints = dir === 'down'
          ? (branchWaypoints[b.id] ?? []).map(wp => ({
              x: wp.col * CELL_W + CELL_W / 2 + OFFSET_X,
              y: wp.row * CELL_H + CELL_H / 2,
            }))
          : [];

        // ── Pfad zeichnen ────────────────────────────────────────────────────
        const d = buildPath(sx, sy, dir, tx, ty, waypoints);
        paths += `<path d="${d}" stroke="${stroke}" stroke-width="2"
          fill="none" marker-end="${marker}" stroke-linecap="round" stroke-linejoin="round"/>`;

        // ── Label ────────────────────────────────────────────────────────────
        if (b.label) {
          // Label liegt immer auf dem ERSTEN Segment der Linie (nah am Quell-Knoten)
          let lx: number, ly: number;
          if (dir === 'left')  { lx = sx - 48; ly = sy; }
          else if (dir === 'right') { lx = sx + 48; ly = sy; }
          else { lx = sx; ly = sy + 16; }   // 'down' – 16 px unterhalb des Austritts

          const lw = Math.max(30, b.label.length * 7.5 + 16);
          paths += `<rect x="${r(lx - lw / 2)}" y="${r(ly - 10)}" width="${r(lw)}" height="20"
            rx="4" fill="#0c1310" stroke="${stroke}" stroke-width="1.2"/>
            <text x="${r(lx)}" y="${r(ly + 4)}" text-anchor="middle" font-size="11"
            font-family="JetBrains Mono,monospace" fill="${stroke}">${escHtml(b.label)}</text>`;
        }
      });
    });

    svg.innerHTML = defs + paths;
  }
}

// ─── Pfad-Hilfsfunktionen ─────────────────────────────────────────────────────

interface Pt { x: number; y: number }

/**
 * Orthogonaler Pfad mit abgerundeten Ecken (Radius R = 12px).
 *
 * dir='left'/'right': zuerst waagerecht zum Ziel-X, dann senkrecht nach unten.
 *   → Label liegt auf dem horizontalen Abschnitt direkt neben dem Quell-Knoten.
 *
 * dir='down': zuerst senkrecht DROP=40px, dann waagerecht, dann senkrecht.
 *   → Label liegt auf dem senkrechten Abschnitt direkt unter dem Quell-Knoten.
 *   → Waypoints werden als Zwischen-Stützpunkte eingehängt.
 */
function buildPath(
  sx: number, sy: number,
  dir: 'down' | 'left' | 'right',
  tx: number, ty: number,
  waypoints: Pt[],
): string {
  const R = 12;

  if (dir === 'left' || dir === 'right') {
    // Horizontaler Ausgang → senkrecht zum Ziel
    const dx = tx - sx;
    if (Math.abs(dx) < 2) return `M${r(sx)},${r(sy)} L${r(tx)},${r(ty)}`;
    const dy = ty - sy;
    const rH = Math.min(R, Math.abs(dx) / 2);
    const rV = Math.min(R, Math.abs(dy) / 2);
    if (dir === 'left') {
      return [
        `M${r(sx)},${r(sy)}`,
        `L${r(tx + rH)},${r(sy)}`,
        `Q${r(tx)},${r(sy)} ${r(tx)},${r(sy + rV)}`,
        `L${r(tx)},${r(ty)}`,
      ].join(' ');
    } else {
      return [
        `M${r(sx)},${r(sy)}`,
        `L${r(tx - rH)},${r(sy)}`,
        `Q${r(tx)},${r(sy)} ${r(tx)},${r(sy + rV)}`,
        `L${r(tx)},${r(ty)}`,
      ].join(' ');
    }
  }

  // dir === 'down': Γ-förmig durch optionale Waypoints
  const DROP = 40;
  const pts: Pt[] = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }];
  const segs: string[] = [`M${r(pts[0].x)},${r(pts[0].y)}`];

  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const dx = p1.x - p0.x;

    if (Math.abs(dx) < 2) {
      segs.push(`L${r(p1.x)},${r(p1.y)}`);
    } else {
      const dropY = p0.y + DROP;
      const rH = Math.min(R, Math.abs(dx) / 2);
      const rV = Math.min(R, Math.abs(p1.y - dropY) / 2);
      if (dx > 0) {
        segs.push(
          `L${r(p0.x)},${r(dropY - rH)}`,
          `Q${r(p0.x)},${r(dropY)} ${r(p0.x + rH)},${r(dropY)}`,
          `L${r(p1.x - rV)},${r(dropY)}`,
          `Q${r(p1.x)},${r(dropY)} ${r(p1.x)},${r(dropY + rV)}`,
          `L${r(p1.x)},${r(p1.y)}`,
        );
      } else {
        segs.push(
          `L${r(p0.x)},${r(dropY - rH)}`,
          `Q${r(p0.x)},${r(dropY)} ${r(p0.x - rH)},${r(dropY)}`,
          `L${r(p1.x + rV)},${r(dropY)}`,
          `Q${r(p1.x)},${r(dropY)} ${r(p1.x)},${r(dropY + rV)}`,
          `L${r(p1.x)},${r(p1.y)}`,
        );
      }
    }
  }
  return segs.join(' ');
}

function r(n: number): number { return Math.round(n * 10) / 10; }
