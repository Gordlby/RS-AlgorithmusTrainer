export const PALETTE = ['#ff4d3d', '#ccff33', '#4fd1a5', '#4fa8ff', '#c77dff', '#ffb84f', '#ff7dc4', '#7de0ff'];

export type NodeType = 'start' | 'process' | 'decision' | 'link' | 'end';

export interface Branch {
  id: string;
  label: string;
  targetId: string | null;
}

export interface FlowchartNode {
  id: string;
  type: NodeType;
  key: string;
  text: string;
  color: string;
  facts: string[];
  linkedFlowchartId: string | null;
  branches: Branch[];
}

export interface Flowchart {
  id: string;
  title: string;
  nodes: FlowchartNode[];
}
