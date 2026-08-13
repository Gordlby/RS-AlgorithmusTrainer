import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageAdapterService } from './storage-adapter.service';
import { Branch, Flowchart, FlowchartNode, NodeType, PALETTE } from '../models/flowchart';

const INDEX_KEY = 'v2-index';
const FC_KEY = (id: string) => `v2-fc:${id}`;

@Injectable({ providedIn: 'root' })
export class AlgoDataService {
  private storage = inject(StorageAdapterService);

  readonly flowcharts = signal<Record<string, Flowchart>>({});
  readonly fcOrder = signal<string[]>([]);
  readonly currentId = signal<string | null>(null);

  readonly currentFc = computed<Flowchart | null>(() => {
    const id = this.currentId();
    return id ? (this.flowcharts()[id] ?? null) : null;
  });

  readonly orderedFlowcharts = computed<Flowchart[]>(() =>
    this.fcOrder()
      .map(id => this.flowcharts()[id])
      .filter((fc): fc is Flowchart => !!fc)
  );

  // ─── Init ────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const indexStr = await this.storage.get(INDEX_KEY);
    const order: string[] = indexStr ? JSON.parse(indexStr) : [];

    if (order.length === 0) {
      const examples = this.buildSeedData();
      const fcs: Record<string, Flowchart> = {};
      const ids: string[] = [];
      for (const fc of examples) {
        fcs[fc.id] = fc;
        ids.push(fc.id);
        await this.storage.set(FC_KEY(fc.id), JSON.stringify(fc));
      }
      await this.storage.set(INDEX_KEY, JSON.stringify(ids));
      this.flowcharts.set(fcs);
      this.fcOrder.set(ids);
    } else {
      const fcs: Record<string, Flowchart> = {};
      const validIds: string[] = [];
      for (const id of order) {
        const str = await this.storage.get(FC_KEY(id));
        if (str) {
          fcs[id] = JSON.parse(str);
          validIds.push(id);
        }
      }
      if (validIds.length !== order.length) {
        await this.storage.set(INDEX_KEY, JSON.stringify(validIds));
      }
      this.flowcharts.set(fcs);
      this.fcOrder.set(validIds);
    }

    const ids = this.fcOrder();
    if (ids.length > 0) this.currentId.set(ids[0]);
  }

  // ─── Flowchart CRUD ──────────────────────────────────────────────────────

  selectFlowchart(id: string): void {
    this.currentId.set(id);
  }

  async createFlowchart(): Promise<void> {
    const id = this.uid();
    const startNode = this.newNode('start');
    startNode.text = 'Start';
    const fc: Flowchart = { id, title: 'Neuer Algorithmus', nodes: [startNode] };
    this.flowcharts.update(fcs => ({ ...fcs, [id]: fc }));
    this.fcOrder.update(order => [...order, id]);
    this.currentId.set(id);
    await this.storage.set(FC_KEY(id), JSON.stringify(fc));
    await this.storage.set(INDEX_KEY, JSON.stringify(this.fcOrder()));
  }

  async deleteFlowchart(id: string): Promise<void> {
    const newFcs = { ...this.flowcharts() };
    delete newFcs[id];
    const newOrder = this.fcOrder().filter(x => x !== id);
    this.flowcharts.set(newFcs);
    this.fcOrder.set(newOrder);
    this.currentId.set(newOrder[0] ?? null);
    await this.storage.delete(FC_KEY(id));
    await this.storage.set(INDEX_KEY, JSON.stringify(newOrder));
  }

  updateTitle(fcId: string, title: string): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      return { ...fcs, [fcId]: { ...fc, title } };
    });
    this.scheduleSave(fcId);
  }

  // ─── Node CRUD ───────────────────────────────────────────────────────────

  addNode(fcId: string): void {
    const fc = this.flowcharts()[fcId];
    if (!fc) return;
    const node = this.newNode('process');
    node.color = PALETTE[fc.nodes.length % PALETTE.length];
    node.text = 'Neuer Schritt';
    this.flowcharts.update(fcs => ({
      ...fcs,
      [fcId]: { ...fcs[fcId], nodes: [...fcs[fcId].nodes, node] }
    }));
    this.scheduleSave(fcId);
  }

  deleteNode(fcId: string, nodeId: string): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          branches: n.branches.map(b => b.targetId === nodeId ? { ...b, targetId: null } : b)
        }));
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  patchNode(fcId: string, nodeId: string, changes: Partial<FlowchartNode>): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      return {
        ...fcs,
        [fcId]: {
          ...fc,
          nodes: fc.nodes.map(n => n.id === nodeId ? { ...n, ...changes } : n)
        }
      };
    });
    this.scheduleSave(fcId);
  }

  changeNodeType(fcId: string, nodeId: string, type: NodeType): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const updated = { ...n, type };
        this.ensureBranchesForType(updated);
        return updated;
      });
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  reorderNodes(fcId: string, orderedIds: string[]): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const map = new Map(fc.nodes.map(n => [n.id, n]));
      const nodes = orderedIds.map(id => map.get(id)!).filter(Boolean);
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  // ─── Facts ───────────────────────────────────────────────────────────────

  addFact(fcId: string, nodeId: string): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n =>
        n.id === nodeId ? { ...n, facts: [...n.facts, ''] } : n
      );
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  updateFact(fcId: string, nodeId: string, index: number, value: string): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const facts = [...n.facts];
        facts[index] = value;
        return { ...n, facts };
      });
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  deleteFact(fcId: string, nodeId: string, index: number): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const facts = n.facts.filter((_, i) => i !== index);
        return { ...n, facts };
      });
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  // ─── Branches ────────────────────────────────────────────────────────────

  addBranch(fcId: string, nodeId: string): void {
    const branch: Branch = { id: this.uid(), label: 'Option', targetId: null };
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n =>
        n.id === nodeId ? { ...n, branches: [...n.branches, branch] } : n
      );
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  patchBranch(fcId: string, nodeId: string, branchId: string, changes: Partial<Branch>): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          branches: n.branches.map(b => b.id === branchId ? { ...b, ...changes } : b)
        };
      });
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  deleteBranch(fcId: string, nodeId: string, branchId: string): void {
    this.flowcharts.update(fcs => {
      const fc = fcs[fcId];
      if (!fc) return fcs;
      const nodes = fc.nodes.map(n =>
        n.id === nodeId ? { ...n, branches: n.branches.filter(b => b.id !== branchId) } : n
      );
      return { ...fcs, [fcId]: { ...fc, nodes } };
    });
    this.scheduleSave(fcId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  newNode(type: NodeType): FlowchartNode {
    const node: FlowchartNode = {
      id: this.uid(), type, key: '', text: '', color: PALETTE[1],
      facts: [], linkedFlowchartId: null, branches: []
    };
    this.ensureBranchesForType(node);
    return node;
  }

  ensureBranchesForType(node: FlowchartNode): void {
    if (node.type === 'decision') {
      if (!node.branches || node.branches.length < 2) {
        node.branches = [
          { id: this.uid(), label: 'Ja', targetId: null },
          { id: this.uid(), label: 'Nein', targetId: null }
        ];
      }
    } else if (node.type === 'end') {
      node.branches = [];
    } else {
      const existingTarget = node.branches?.[0]?.targetId ?? null;
      node.branches = [{ id: this.uid(), label: '', targetId: existingTarget }];
    }
    if (node.type !== 'link') node.linkedFlowchartId = null;
  }

  nodeLabel(fc: Flowchart, id: string): string {
    const n = fc.nodes.find(x => x.id === id);
    if (!n) return '?';
    if (n.type === 'link') {
      const t = this.flowcharts()[n.linkedFlowchartId ?? ''];
      return '↳ ' + (t ? t.title : '(gelöscht)');
    }
    if (n.type === 'end') return 'Ende: ' + (n.text || 'Ende');
    return (n.key ? n.key + ': ' : '') + (n.text || '(ohne Text)');
  }

  /** Speicher-Status für UI-Feedback */
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'pending' | 'error' | 'auth'>('idle');

  /** Persistenter Zustand: User hat offene Anträge */
  readonly hasPendingRequest = signal(false);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleSave(fcId: string): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveStatus.set('saving');
    this.saveTimer = setTimeout(() => this.persistFlowchart(fcId), 500);
  }

  async persistFlowchart(fcId: string): Promise<void> {
    const fc = this.flowcharts()[fcId];
    if (!fc) return;
    try {
      await this.storage.set(FC_KEY(fcId), JSON.stringify(fc));
      this.setStatusTemporarily('saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'PENDING_APPROVAL') this.setStatusTemporarily('pending');
      else if (msg === 'NOT_LOGGED_IN') this.saveStatus.set('auth');
      else this.setStatusTemporarily('error');
    }
  }

  private setStatusTemporarily(status: 'saved' | 'pending' | 'error'): void {
    this.saveStatus.set(status);
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.saveStatus.set('idle'), 4000);
  }

  // ─── Seed Data ───────────────────────────────────────────────────────────

  private buildSeedData(): Flowchart[] {
    const n = (type: NodeType, text: string, color: string, facts: string[] = [], key = ''): FlowchartNode =>
      ({ id: this.uid(), type, key, text, color, facts, linkedFlowchartId: null, branches: [] });

    // fc2: Schockmanagement
    const fc2: Flowchart = { id: this.uid(), title: 'Schockmanagement (Beispiel)', nodes: [] };
    const s2_1 = n('start', 'Patient antreffen', PALETTE[1]);
    const s2_2 = n('process', 'Schocklage / Beine hochlagern', PALETTE[1], ['Kontraindikation prüfen (z.B. SHT, Atemnot)']);
    const s2_3 = n('process', 'Sauerstoffgabe nach Bedarf', PALETTE[1]);
    const s2_4 = n('process', 'i.v. Zugang, Volumengabe nach Protokoll', PALETTE[1]);
    const s2_5 = n('end', 'Transport & laufende Reevaluation', PALETTE[1]);
    s2_1.branches = [{ id: this.uid(), label: '', targetId: s2_2.id }];
    s2_2.branches = [{ id: this.uid(), label: '', targetId: s2_3.id }];
    s2_3.branches = [{ id: this.uid(), label: '', targetId: s2_4.id }];
    s2_4.branches = [{ id: this.uid(), label: '', targetId: s2_5.id }];
    fc2.nodes = [s2_1, s2_2, s2_3, s2_4, s2_5];

    // fc1: cABCDE
    const fc1: Flowchart = { id: this.uid(), title: 'cABCDE – Erstcheck (Beispiel)', nodes: [] };
    const s1 = n('start', 'Patient antreffen', PALETTE[1]);
    const d1 = n('decision', 'Kritische, lebensbedrohliche Blutung sichtbar?', PALETTE[0], [], 'c');
    const p1 = n('process', 'Sofort stillen: Kompression / Tourniquet', PALETTE[0]);
    const p2 = n('process', 'Atemweg prüfen (frei? HWS-Schutz bei Trauma?)', PALETTE[1],
      ['Reagiert / spricht der Patient?', 'Mundraum: Fremdkörper, Blut?', 'Atemgeräusche: Stridor, Gurgeln?'], 'A');
    const p3 = n('process', 'Atmung beurteilen', PALETTE[2],
      ['Atemfrequenz (12–20/min normal)', 'Symmetrie & Tiefe des Thorax', 'Auskultation beidseits', 'SpO2 messen'], 'B');
    const p4 = n('process', 'Kreislauf beurteilen', PALETTE[3],
      ['Puls: Frequenz, Rhythmus, Qualität', 'Rekapillarisierungszeit (<2 Sek.)', 'Hautfarbe/-temperatur', 'Blutdruck messen'], 'C');
    const d2 = n('decision', 'Schockzeichen vorhanden (Puls>100, RR syst<90, kalt/feucht)?', PALETTE[3]);
    const lnk: FlowchartNode = {
      id: this.uid(), type: 'link', key: '', text: 'Siehe Algorithmus: Schockmanagement',
      color: PALETTE[3], facts: [], linkedFlowchartId: fc2.id, branches: []
    };
    const preassess = n('process', 'Re-Evaluierung nach 5 Minuten', PALETTE[3], ['Vitalparameter erneut kontrollieren']);
    const p5 = n('process', 'Bewusstsein prüfen', PALETTE[4],
      ['AVPU / GCS bestimmen', 'Pupillen: Größe, Symmetrie, Lichtreaktion', 'Blutzucker messen'], 'D');
    const p6 = n('process', 'Ganzkörpercheck & Wärmeerhalt', PALETTE[5],
      ['Verletzungen suchen', 'Körpertemperatur beurteilen', 'Sofort wieder zudecken'], 'E');
    const e1 = n('end', 'Übergabe / weitere Versorgung', PALETTE[5]);

    s1.branches = [{ id: this.uid(), label: '', targetId: d1.id }];
    d1.branches = [
      { id: this.uid(), label: 'Ja', targetId: p1.id },
      { id: this.uid(), label: 'Nein', targetId: p2.id }
    ];
    p1.branches = [{ id: this.uid(), label: '', targetId: p2.id }];
    p2.branches = [{ id: this.uid(), label: '', targetId: p3.id }];
    p3.branches = [{ id: this.uid(), label: '', targetId: p4.id }];
    p4.branches = [{ id: this.uid(), label: '', targetId: d2.id }];
    d2.branches = [
      { id: this.uid(), label: 'Ja, schwer', targetId: lnk.id },
      { id: this.uid(), label: 'Grenzwertig', targetId: preassess.id },
      { id: this.uid(), label: 'Nein', targetId: p5.id }
    ];
    lnk.branches = [{ id: this.uid(), label: '', targetId: p5.id }];
    preassess.branches = [{ id: this.uid(), label: '', targetId: p5.id }];
    p5.branches = [{ id: this.uid(), label: '', targetId: p6.id }];
    p6.branches = [{ id: this.uid(), label: '', targetId: e1.id }];
    fc1.nodes = [s1, d1, p1, p2, p3, p4, d2, lnk, preassess, p5, p6, e1];

    return [fc1, fc2];
  }
}
