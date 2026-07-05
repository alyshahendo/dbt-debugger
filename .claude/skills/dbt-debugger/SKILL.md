---
name: dbt-debugger
description: >-
  Diagnose a failed dbt run/build/test by finding the model that ACTUALLY broke
  versus the ones that were only skipped as collateral. Use when a `dbt run`,
  `dbt build`, or `dbt test` fails; when the user shares dbt artifacts
  (manifest.json / run_results.json / a target/ directory); or when they ask
  "why did my dbt build fail", "what actually broke", "which model is the root
  cause", or "what's the blast radius". Produces an interactive lineage HTML and
  a plain-language root-cause explanation.
---

# dbt-debugger

Turn a failed dbt run into (1) a root-cause diagnosis and (2) a self-contained
interactive lineage map that makes the blast radius obvious. Runs read-only over
the artifacts any dbt run already produces — never touches the warehouse.

## When to use this

- A `dbt run` / `dbt build` / `dbt test` failed and the user wants to know what
  to fix.
- The user points at a `target/` directory or shares `manifest.json` +
  `run_results.json`.
- The user asks which failure is the real cause vs. a downstream skip, or how
  many models a failure gated.

## Step 1 — generate the lineage HTML

Run from the repository root (uses the project venv, which has the deps):

```bash
backend/.venv/bin/python -m backend.app.cli --target <path-to-target> --out dbt-debug-lineage.html --no-open
```

Alternatives:
- Explicit files: `--manifest <m.json> --run-results <rr.json> [--sources <s.json>]`
- No local project to hand? Use a bundled example to demonstrate:
  `--example` (build failure cascade), `--example-test` (failing tests),
  `--example-run` (run failure).
- Drop `--no-open` to also open it in the browser.

Tell the user the HTML path and that it's a shareable, self-contained file.

## Step 2 — explain the root cause (do this, don't just hand over the file)

Read the failure graph and narrate the analysis. Get the structured data:

```bash
backend/.venv/bin/python -c "
from backend.app.engine import analyze_target
import json
g = analyze_target('<target>')
roots = [n for n in g['nodes'] if n.get('failure_class') == 'root_cause']
for n in roots:
    blast = sum(1 for x in g['nodes'] if x.get('blamed_root_cause') == n['id'])
    print('ROOT', n['name'], '| path:', n.get('path'), '| blast:', blast)
    if n.get('message'): print('  error:', n['message'])
"
```

Then, for each root cause:
1. Read the model's SQL at its `path`.
2. Explain in plain language *why* it failed, grounded in the dbt error `message`
   and the SQL.
3. State the blast radius (how many downstream models it gated) so the user
   knows the stakes.
4. Call out the **casualties** — models that were skipped *only because* an
   upstream root cause failed (`failure_class == "casualty"`). Tell the user NOT
   to chase these; fixing the root cause unblocks them.
5. Propose a concrete fix for each root cause.

## Node-level questions ("Ask Claude about this node")

When the user asks about one specific node (e.g. "explain the stg_payments
failure" — often after clicking a node in the HTML):

- Find the node in the graph; note its `status`, `message`, `path`,
  `failure_class`, and `blamed_root_cause`.
- **Root cause** (`status == "error"` or a failing test): read the SQL at `path`,
  explain the error, propose a fix.
- **Casualty** (`failure_class == "casualty"`): it didn't really fail — point the
  user to the upstream root cause named in `blamed_root_cause` instead.
- **Stale source** (`freshness_status` is `warn`/`error`): the source data is
  behind its freshness threshold; the fix is upstream of dbt (the ingestion/load).

## How the classification works (so you can explain it correctly)

- `status == "error"` → the model ran and errored; its parents were fine → it's a
  **root cause**.
- `status == "skipped"` → dbt blocked it because something upstream failed → a
  **casualty**, attributed to its nearest failed ancestor.
- In `dbt build`, a failing **test** gates the models below it, so the test's
  model is treated as a blocking root cause.

Never tell the user to fix a casualty — that's the core value of this tool.
