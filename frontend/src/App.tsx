import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Graph } from './types';
import { deriveModel, computeHidden, firstFailure, withPathLayout } from './model';
import { useViewport } from './hooks/useViewport';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { Toolbar } from './components/Toolbar';
import { Diagram } from './components/Diagram';
import { Sidebar } from './components/Sidebar';
import { Drawer } from './components/Drawer';

export function App({ graph }: { graph: Graph }) {
  const model = useMemo(() => deriveModel(graph), [graph]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const failureId = useMemo(() => firstFailure(model), [model]);
  const [selectedId, setSelectedId] = useState<string | null>(failureId);
  // On a large failed run, showing all 1000 nodes buries the failure; start
  // focused on the failure paths (the toggle still expands to the full DAG).
  const [pathOnly, setPathOnly] = useState(failureId != null && model.graph.nodes.length > 150);
  const hidden = useMemo(() => computeHidden(model, pathOnly), [model, pathOnly]);
  // In path-only mode, re-pack the visible nodes so they sit together on screen
  // instead of keeping their scattered positions from the full-DAG layout.
  const active = useMemo(() => (pathOnly ? withPathLayout(model, hidden) : model), [model, pathOnly, hidden]);
  const { view, zoomTo, panToNode } = useViewport(active, wrapRef);

  // Land on the failure instead of the empty top-left corner of the canvas
  // (re-runs when the layout changes, e.g. toggling path-only).
  useEffect(() => {
    if (failureId) panToNode(failureId);
  }, [failureId, panToNode]);

  const goTo = (id: string) => {
    panToNode(id);
    setSelectedId(id);
  };

  return (
    <>
      <Header model={model} />
      <main>
        <Sidebar model={model} onSelect={goTo} />
        <div id="canvaswrap" ref={wrapRef}>
          <Toolbar
            model={model}
            pathOnly={pathOnly}
            zoom={view.zoom}
            onTogglePath={() => setPathOnly(p => !p)}
            onZoom={zoomTo}
            onFocus={goTo}
          />
          <Legend model={model} />
          <Diagram model={active} view={view} hidden={hidden} selectedId={selectedId} onSelect={goTo} />
        </div>
        <Drawer model={model} node={selectedId ? model.byId[selectedId] : null} onClose={() => setSelectedId(null)} />
      </main>
    </>
  );
}
