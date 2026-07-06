import type { Model } from '../model';
import { NODE_W, NODE_H } from '../model';
import { STATUS, nodeState } from '../status';
import type { GraphNode } from '../types';
import type { View } from '../hooks/useViewport';

function nodeSub(n: GraphNode): string {
  if (n.resource_type === 'source')
    return n.freshness_status === 'warn' || n.freshness_status === 'error' ? 'source · stale' : 'source';
  let sub = n.materialization || 'model';
  if (n.status === 'error') sub += ' · failed';
  else if (n.failure_class === 'suspect') sub += ' · suspect';
  else if (n.failure_class === 'casualty') sub += ' · skipped';
  else if (n.test_status === 'fail' || n.test_status === 'error') sub += ' · test failed';
  return sub;
}

function Edges({ model, hidden }: { model: Model; hidden: Set<string> }) {
  const { width, height } = model;
  return (
    <svg id="edges" width={width} height={height} style="position:absolute;inset:0;z-index:1;pointer-events:none">
      <defs>
        <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#f2853c" flood-opacity="0.55" />
        </filter>
      </defs>
      {model.graph.edges.map((e, i) => {
        const a = model.pos[e.source];
        const b = model.pos[e.target];
        if (!a || !b || hidden.has(e.source) || hidden.has(e.target)) return null;
        const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
        const glow = model.cascade.has(e.source) && model.cascade.has(e.target);
        const intoFail = model.byId[e.target]?.failure_class === 'root_cause';
        const props = glow
          ? { stroke: '#f2853c', 'stroke-width': 2.6, filter: 'url(#glow)' }
          : intoFail
            ? { stroke: 'rgba(242,85,90,0.5)', 'stroke-width': 1.6 }
            : { stroke: 'rgba(255,255,255,0.09)', 'stroke-width': 1.4 };
        return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" {...props} />;
      })}
    </svg>
  );
}

function Node({
  model,
  node,
  hidden,
  selected,
  onSelect,
}: {
  model: Model;
  node: GraphNode;
  hidden: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const st = STATUS[nodeState(node, model.isTestRun)];
  const p = model.pos[node.id];
  return (
    <div
      class={`node ${st.node}${selected ? ' sel' : ''}`}
      style={{ left: `${p.x}px`, top: `${p.y}px`, display: hidden ? 'none' : 'flex' }}
      onClick={() => onSelect(node.id)}
    >
      <span class="ico">{st.icon}</span>
      <span class="nm">{node.name}</span>
      <span class="sub">{nodeSub(node)}</span>
    </div>
  );
}

interface Props {
  model: Model;
  view: View;
  hidden: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Diagram({ model, view, hidden, selectedId, onSelect }: Props) {
  return (
    <div
      id="canvas"
      style={{
        width: `${model.width}px`,
        height: `${model.height}px`,
        transform: `translate(${view.panX}px,${view.panY}px) scale(${view.zoom})`,
      }}
    >
      <Edges model={model} hidden={hidden} />
      {model.graph.nodes.map(n => (
        <Node
          key={n.id}
          model={model}
          node={n}
          hidden={hidden.has(n.id)}
          selected={n.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
