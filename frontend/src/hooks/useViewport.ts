import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { NODE_W, NODE_H, type Model } from '../model';

const ZMIN = 0.3;
const ZMAX = 2.5;

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export function useViewport(model: Model, wrapRef: RefObject<HTMLElement>) {
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const zoomTo = useCallback((z: number, ox?: number, oy?: number) => {
    z = Math.max(ZMIN, Math.min(ZMAX, z));
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const cur = viewRef.current;
    if (ox == null) {
      ox = r.width / 2;
      oy = r.height / 2;
    }
    const cx = (ox - cur.panX) / cur.zoom;
    const cy = (oy! - cur.panY) / cur.zoom;
    setView({ zoom: z, panX: ox - cx * z, panY: oy! - cy * z });
  }, []);

  const panToNode = useCallback(
    (id: string) => {
      const p = model.pos[id];
      const wrap = wrapRef.current;
      if (!p || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const cur = viewRef.current;
      const PAD = 32;
      const usable = Math.max(240, r.width - 320);
      const contentW = model.width * cur.zoom;
      const contentH = model.height * cur.zoom;
      let px = usable / 2 - (p.x + NODE_W / 2) * cur.zoom;
      px = contentW <= usable - PAD ? PAD : Math.max(usable - PAD - contentW, Math.min(PAD, px));
      let py = r.height / 2 - (p.y + NODE_H / 2) * cur.zoom;
      py = contentH <= r.height - PAD ? PAD : Math.max(r.height - PAD - contentH, Math.min(PAD, py));
      setView({ zoom: cur.zoom, panX: px, panY: py });
    },
    [model],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomTo(viewRef.current.zoom * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
    };

    let sx = 0, sy = 0, spx = 0, spy = 0, down = false, dragged = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = true;
      dragged = false;
      sx = e.clientX;
      sy = e.clientY;
      spx = viewRef.current.panX;
      spy = viewRef.current.panY;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      dragged = true;
      wrap.classList.add('panning');
      setView(v => ({ ...v, panX: spx + dx * 0.6, panY: spy + dy * 0.6 }));
      e.preventDefault();
    };
    const onUp = () => {
      down = false;
      wrap.classList.remove('panning');
    };
    const onClickCapture = (e: MouseEvent) => {
      if (dragged) {
        e.stopPropagation();
        dragged = false;
      }
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    wrap.addEventListener('click', onClickCapture, true);
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('click', onClickCapture, true);
    };
  }, [zoomTo]);

  return { view, zoomTo, panToNode };
}
