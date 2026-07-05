# dbt-debug frontend

The interactive lineage UI, built with Preact + Vite and bundled into a single
self-contained HTML shell that the Python renderer injects the failure graph
into at runtime.

## Develop

```bash
cd frontend
npm install
npm run dev        # vite dev server, uses public/sample-graph.json
```

## Build

```bash
npm run build
```

`vite build` inlines all JS/CSS into one file and writes it to
`backend/app/web/index.html` — the shell the Python package ships. It contains a
`__GRAPH_JSON__` placeholder that `backend/app/render.py` replaces with the
serialized graph. **Rebuild and commit `backend/app/web/index.html` whenever you
change the UI.**

No Node is needed at runtime — only to rebuild the shell.
