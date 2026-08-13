import { Flowchart, FlowchartNode } from '../models/flowchart';

export const CELL_W = 300;
export const CELL_H = 180;
export const BRANCH_COLORS = ['#ccff33', '#ff4d3d', '#4fa8ff', '#ffb84f', '#c77dff', '#4fd1a5', '#ff7dc4', '#7de0ff'];

export interface NodePosition { row: number; col: number; }
export interface Waypoint { row: number; col: number; }

export interface LayoutResult {
  positions: Record<string, NodePosition>;
  branchWaypoints: Record<string, Waypoint[]>;
  byId: Record<string, FlowchartNode>;
  maxRow: number;
  maxCol: number;
}

/**
 * Simplified Sugiyama-style layout:
 * 1) Row = longest path from start node (cycle-safe BFS)
 * 2) Multi-row-spanning edges get dummy waypoints so branches stay visually separated
 * 3) Column = barycenter of parent columns, then spread to avoid overlap
 */
export function computeLayout(fc: Flowchart): LayoutResult {
  const byId: Record<string, FlowchartNode> = {};
  fc.nodes.forEach(n => byId[n.id] = n);

  const root = fc.nodes.find(n => n.type === 'start') ?? fc.nodes[0];
  const rows: Record<string, number> = {};

  function assignRow(nodeId: string, depth: number, pathSet: Set<string>): void {
    if (pathSet.has(nodeId)) return;
    if (rows[nodeId] !== undefined && rows[nodeId] >= depth) return;
    rows[nodeId] = depth;
    const node = byId[nodeId];
    if (!node) return;
    const nextPath = new Set(pathSet);
    nextPath.add(nodeId);
    (node.branches ?? []).forEach(b => {
      if (b.targetId && byId[b.targetId]) assignRow(b.targetId, depth + 1, nextPath);
    });
  }
  if (root) assignRow(root.id, 0, new Set());

  let extraRow = (Object.keys(rows).length ? Math.max(...Object.values(rows)) : -1) + 1;
  fc.nodes.forEach(n => { if (rows[n.id] === undefined) { rows[n.id] = extraRow; extraRow++; } });

  // Dummy waypoints for edges that skip rows
  const dummyRow: Record<string, number> = {};
  const parentsOf: Record<string, string[]> = {};
  const branchChain: Record<string, string[]> = {};
  let dummyCounter = 0;

  const addParent = (child: string, parent: string) => {
    (parentsOf[child] = parentsOf[child] ?? []).push(parent);
  };

  fc.nodes.forEach(n => {
    (n.branches ?? []).forEach(b => {
      if (!b.targetId || !byId[b.targetId]) return;
      const rA = rows[n.id], rB = rows[b.targetId];
      if (rB <= rA) return;
      if (rB === rA + 1) { addParent(b.targetId, n.id); branchChain[b.id] = []; return; }
      let prev = n.id;
      const chain: string[] = [];
      for (let r = rA + 1; r < rB; r++) {
        const dId = `__d_${dummyCounter++}`;
        dummyRow[dId] = r;
        addParent(dId, prev);
        chain.push(dId);
        prev = dId;
      }
      addParent(b.targetId, prev);
      branchChain[b.id] = chain;
    });
  });

  const realMax = Object.keys(rows).length ? Math.max(...Object.values(rows)) : 0;
  const dummyMax = Object.keys(dummyRow).length ? Math.max(...Object.values(dummyRow)) : 0;
  const maxRowIdx = Math.max(realMax, dummyMax);
  const rowGroups: string[][] = [];
  for (let r = 0; r <= maxRowIdx; r++) rowGroups.push([]);
  fc.nodes.forEach(n => rowGroups[rows[n.id]].push(n.id));
  Object.keys(dummyRow).forEach(id => rowGroups[dummyRow[id]].push(id));

  const colOf: Record<string, number> = {};
  rowGroups[0]?.forEach((id, i) => { colOf[id] = i; });

  for (let r = 1; r <= maxRowIdx; r++) {
    const withDesired = rowGroups[r].map(id => {
      const parents = (parentsOf[id] ?? []).filter(p => colOf[p] !== undefined);
      const val = parents.length ? parents.reduce((a, p) => a + colOf[p], 0) / parents.length : 0;
      return { id, val };
    });
    withDesired.sort((a, b) => a.val - b.val);
    let last = -Infinity;
    // Min gap = 1.2 so 3-branch fans spread slightly further than 1 column apart
    withDesired.forEach(d => { const c = Math.max(d.val, last + 1.2); colOf[d.id] = c; last = c; });
  }

  const positions: Record<string, NodePosition> = {};
  fc.nodes.forEach(n => {
    if (colOf[n.id] !== undefined) positions[n.id] = { row: rows[n.id], col: colOf[n.id] };
  });

  const branchWaypoints: Record<string, Waypoint[]> = {};
  Object.keys(branchChain).forEach(bid => {
    branchWaypoints[bid] = branchChain[bid].map(dId => ({ row: dummyRow[dId], col: colOf[dId] }));
  });

  let maxRow = 0, maxCol = 0;
  Object.values(positions).forEach(p => { maxRow = Math.max(maxRow, p.row); maxCol = Math.max(maxCol, p.col); });

  return { positions, branchWaypoints, byId, maxRow, maxCol };
}
