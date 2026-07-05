---
name: dbt-debugger
description: >-
  Diagnose a failed dbt run/build/test by finding the model that ACTUALLY broke
  versus the ones that were only skipped as collateral. Use when a `dbt run`,
  `dbt build`, or `dbt test` fails; when the user shares dbt artifacts
  (manifest.json / run_results.json / a target/ directory); or when they ask
  "why did my dbt build fail", "what actually broke", "which model is the root
  cause", or "what's the blast radius". Produces an interactive lineage HTML
  with your root-cause analysis embedded in it.
---

# dbt-debugger

Turn a failed dbt run into (1) a root-cause diagnosis and (2) a self-contained
interactive lineage map — with your analysis of each root cause baked into the
map's detail drawer. Runs read-only over the artifacts dbt already produces;
never touches the warehouse.

## When to use this

- A `dbt run` / `dbt build` / `dbt test` failed and the user wants to know what
  to fix.
- The user points at a `target/` directory or shares `manifest.json` +
  `run_results.json`.
- The user asks which failure is the real cause vs. a downstream skip, or how
  many models a failure gated.

All commands run from the repository root using the project venv.

## Step 1 — find the root causes

```bash
backend/.venv/bin/python -c "
from backend.app.engine import analyze_target
g = analyze_target('<target-or-fixture>')
for n in g['nodes']:
    if n.get('failure_class') == 'root_cause':
        blast = sum(1 for x in g['nodes'] if x.get('blamed_root_cause') == n['id'])
        print('ROOT', n['name'], '| path:', n.get('path'), '| blast:', blast)
        if n.get('message'): print('  error:', n['message'])
"
```

Use a bundled fixture path to demo: `fixtures/jaffle_shop_demo` (build failure),
`fixtures/jaffle_shop_test` (failing tests), `fixtures/jaffle_shop_run` (run
failure).

## Step 2 — analyze each root cause

For every root cause: read its SQL file (the `path`), and using the dbt error
`message`, work out *why* it failed and *how to fix it*. Write a concise
explanation (2–4 sentences — it renders inside a narrow drawer) into an analysis
map keyed by model name:

```json
{
  "stg_payments": "Fails because the raw.payments source has no `payment_method` column — the SELECT references it directly. Fix: remove/rename that column, or add it to the source. Gated 5 downstream models.",
  "dim_products": "The not_null test on product_id failed (7 rows) — some products have a null id. Investigate the join in dim_products.sql or add a filter."
}
```

Save it to `analysis.json`.

## Step 3 — render with your analysis embedded

```bash
backend/.venv/bin/python -m backend.app.cli --target <target> --analysis analysis.json --out dbt-debug-lineage.html --no-open
```

(For a fixture, swap `--target <target>` for `--example` / `--example-test` /
`--example-run`. Drop `--no-open` to open the browser.)

Each analyzed node's drawer now shows a **"✦ Claude's analysis"** block inline —
the user reads the diagnosis right in the map, no asking required.

Then, in the terminal, also:
- Name each root cause and its blast radius.
- Call out the **casualties** (`failure_class == "casualty"`) and tell the user
  NOT to chase them — fixing the root cause unblocks them.
- Offer to apply the proposed fix.

## How the classification works (so you explain it correctly)

- `status == "error"` → the model ran and errored; its parents were fine → a
  **root cause**.
- `status == "skipped"` → dbt blocked it because something upstream failed → a
  **casualty**, attributed to its nearest failed ancestor.
- In `dbt build`, a failing **test** gates the models below it, so the test's
  model is treated as a blocking root cause.

Never tell the user to fix a casualty — that's the whole point of this tool.
