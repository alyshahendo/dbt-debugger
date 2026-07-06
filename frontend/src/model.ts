import type { Graph, GraphNode } from './types';

export const LANE_X = (i: number) => 24 + i * 224;
export const NODE_W = 158;
export const NODE_H = 46;
export const ROW = 72;
export const TOP = 70;

export interface Model {
  graph: Graph;
  isTestRun: boolean;
  byId: Record<string, GraphNode>;
  childrenOf: Record<string, string[]>;
  rootCauses: string[];
  blastOf: Record<string, number>;
  cascade: Set<string>;
  pos: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

export function deriveModel(graph: Graph): Model {
  const isTestRun = graph.command === 'test';

  const byId: Record<string, GraphNode> = {};
  graph.nodes.forEach(n => (byId[n.id] = n));

  const childrenOf: Record<string, string[]> = {};
  graph.edges.forEach(e => (childrenOf[e.source] ||= []).push(e.target));

  const rootCauses = graph.nodes.filter(n => n.failure_class === 'root_cause').map(n => n.id);

  const blastOf: Record<string, number> = {};
  graph.nodes.forEach(n => {
    if (n.blamed_root_cause && n.failure_class === 'casualty')
      blastOf[n.blamed_root_cause] = (blastOf[n.blamed_root_cause] || 0) + 1;
  });

  const cascade = new Set<string>();
  const seeds = isTestRun
    ? graph.nodes.filter(n => n.test_status === 'fail' || n.test_status === 'error').map(n => n.id)
    : rootCauses;
  const stack = [...seeds];
  seeds.forEach(s => cascade.add(s));
  while (stack.length) {
    const u = stack.pop()!;
    (childrenOf[u] || []).forEach(v => {
      if (cascade.has(v)) return;
      const nv = byId[v];
      if (!nv) return;
      const follow = isTestRun ? true : nv.failure_class === 'casualty' || nv.failure_class === 'skipped';
      if (follow) {
        cascade.add(v);
        stack.push(v);
      }
    });
  }

  const pos: Record<string, { x: number; y: number }> = {};
  const lanes: Record<number, GraphNode[]> = {};
  graph.nodes.forEach(n => (lanes[n.lane] ||= []).push(n));
  Object.values(lanes).forEach(arr =>
    arr.sort((a, b) =>
      a.resource_type < b.resource_type ? -1 : a.resource_type > b.resource_type ? 1 : a.name.localeCompare(b.name)));
  const occupied = Object.keys(lanes).map(Number).sort((a, b) => a - b);
  const colOf: Record<number, number> = {};
  occupied.forEach((l, i) => (colOf[l] = i));

  let maxRows = 0;
  occupied.forEach(li => {
    lanes[li].forEach((n, i) => (pos[n.id] = { x: LANE_X(colOf[li]), y: TOP + i * ROW }));
    maxRows = Math.max(maxRows, lanes[li].length);
  });

  return {
    graph,
    isTestRun,
    byId,
    childrenOf,
    rootCauses,
    blastOf,
    cascade,
    pos,
    width: LANE_X(Math.max(0, occupied.length - 1)) + NODE_W + 40,
    height: TOP + maxRows * ROW + 30,
  };
}

export const blast = (m: Model, id: string) => m.blastOf[id] || 0;

export function computeHidden(m: Model, pathOnly: boolean): Set<string> {
  const hidden = new Set<string>();
  if (!pathOnly) return hidden;
  m.graph.nodes.forEach(n => {
    if (m.cascade.has(n.id)) return;
    const keep = (m.childrenOf[n.id] || []).some(c => m.cascade.has(c)) && n.resource_type === 'source';
    if (!keep) hidden.add(n.id);
  });
  return hidden;
}

export function firstFailure(m: Model): string | null {
  const g = m.graph;
  const n =
    g.nodes.find(x => x.status === 'error') ||
    g.nodes.find(x => x.test_status === 'fail' || x.test_status === 'error') ||
    g.nodes.find(x => x.resource_type === 'source' && (x.freshness_status === 'warn' || x.freshness_status === 'error'));
  return n ? n.id : null;
}
