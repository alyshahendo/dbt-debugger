import { render } from 'preact';
import { App } from './App';
import type { Graph } from './types';
import './styles.css';

async function loadGraph(): Promise<Graph> {
  const el = document.getElementById('graph-data');
  const raw = (el?.textContent || '').trim();
  // injected data is a JSON object; the un-injected placeholder is not
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('failed to parse injected graph data', e);
    }
  }
  // dev-only fallback (compiled out of the production bundle): vite serves public/
  if (import.meta.env.DEV) {
    const res = await fetch('/sample-graph.json');
    return res.json();
  }
  throw new Error('no graph data injected');
}

loadGraph().then(graph => {
  render(<App graph={graph} />, document.getElementById('app')!);
});
