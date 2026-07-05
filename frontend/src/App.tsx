import { useMemo, useRef, useState } from 'preact/hooks';
import type { Graph } from './types';
import { deriveModel, computeHidden, firstFailure } from './model';
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
  const { view, zoomTo, panToNode } = useViewport(model, wrapRef);
  const [selectedId, setSelectedId] = useState<string | null>(() => firstFailure(model));
  const [pathOnly, setPathOnly] = useState(false);
  const hidden = useMemo(() => computeHidden(model, pathOnly), [model, pathOnly]);

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
          <Diagram model={model} view={view} hidden={hidden} selectedId={selectedId} onSelect={goTo} />
        </div>
        <Drawer model={model} node={selectedId ? model.byId[selectedId] : null} onClose={() => setSelectedId(null)} />
      </main>
    </>
  );
}
