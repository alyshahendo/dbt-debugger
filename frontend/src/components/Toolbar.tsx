import { useMemo, useState } from 'preact/hooks';
import type { Model } from '../model';

interface Props {
  model: Model;
  pathOnly: boolean;
  zoom: number;
  onTogglePath: () => void;
  onZoom: (z: number) => void;
  onFocus: (id: string) => void;
}

export function Toolbar({ model, pathOnly, zoom, onTogglePath, onZoom, onFocus }: Props) {
  const targets = useMemo(
    () =>
      model.isTestRun
        ? model.graph.nodes.filter(n => n.test_status === 'fail' || n.test_status === 'error').map(n => n.id)
        : model.rootCauses,
    [model],
  );
  const [i, setI] = useState(0);

  const step = () => {
    if (!targets.length) return;
    const next = (i + 1) % targets.length;
    setI(next);
    onFocus(targets[next]);
  };

  return (
    <div class="toolbar">
      <div class="tbtn" onClick={step}>
        ◂ Focus failure <span>{targets.length ? `${i + 1} / ${targets.length}` : '0'}</span> ▸
      </div>
      <div class={`tbtn${pathOnly ? ' on' : ''}`} onClick={onTogglePath}>
        {pathOnly ? '◉' : '◯'} Failure paths only
      </div>
      <div class="tbtn zbtn" onClick={() => onZoom(zoom / 1.2)}>−</div>
      <div class="tbtn zbtn" onClick={() => onZoom(1)}>{`${Math.round(zoom * 100)}%`}</div>
      <div class="tbtn zbtn" onClick={() => onZoom(zoom * 1.2)}>+</div>
    </div>
  );
}
