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
interactive lineage map, with your analysis of each root cause baked into the
map's detail drawer. Runs read-only over the artifacts dbt already produces;
never touches the warehouse.

Requires the `dbt-debug` command on PATH (`pipx install dbt-debugger`, or from a
source checkout `pipx install ./backend`). All steps use only that command.

## When to use this

- A `dbt run` / `dbt build` / `dbt test` failed and the user wants to know what
  to fix.
- The user points at a `target/` directory or shares `manifest.json` +
  `run_results.json`.
- The user asks which failure is the real cause vs. a downstream skip, or how
  many models a failure gated.

The artifacts are usually in `./target/` after a dbt run. If unsure, ask the
user or look for `target/manifest.json` + `target/run_results.json`.

## Step 1: inspect the failure graph

```bash
dbt-debug --target ./target --json > /tmp/dbt-graph.json
```

(Or `--manifest <m.json> --run-results <rr.json> [--sources <s.json>]`.) Read
`/tmp/dbt-graph.json` and find the root causes, the nodes with
`failure_class == "root_cause"`. For each, note its `name`, `path`, `status`,
`message`, and how many nodes list it as their `blamed_root_cause` (the blast
radius). Also note the failing tests (a model's `tests[]` with status
`fail`/`error`), including each test's `compiled_sql`.

## Step 2: analyze each root cause

For every root cause: read its SQL file (`path`), and using the dbt error
`message` (or the failing test), work out *why* it failed and *how to fix it*.
Write a concise explanation (2 to 4 sentences, it renders in a narrow drawer) into
an analysis map keyed by model name:

```json
{
  "stg_payments": "Fails because the raw.payments source has no `payment_method` column, which the SELECT references. Fix: rename it to the real column, or add it to the source. Gated 5 downstream models.",
  "dim_products": "The not_null test on product_id failed (7 rows); some products have a null id, likely an unmatched join in dim_products.sql. Investigate the join or filter the orphans."
}
```

Save it to `/tmp/dbt-analysis.json`.

## Step 3: render with your analysis embedded

```bash
dbt-debug --target ./target --analysis /tmp/dbt-analysis.json --out dbt-debug-lineage.html
```

Each analyzed node's drawer now shows a **"✦ Claude's analysis"** block inline, so
the user reads the diagnosis right in the map.

Then, in the terminal, also:
- Name each root cause and its blast radius.
- Call out the **casualties** (`failure_class == "casualty"`) and tell the user
  NOT to chase them; fixing the root cause unblocks them.
- For a failing test, point them at its `compiled_sql`; running it returns the
  offending rows.
- Offer to apply the proposed fix.

## How the classification works (so you explain it correctly)

- `status == "error"` → the model ran and errored; its parents were fine → a
  **root cause**.
- `status == "skipped"` → dbt blocked it because something upstream failed → a
  **casualty**, attributed to its nearest failed ancestor.
- In `dbt build`, a failing **test** gates the models below it, so the test's
  model is treated as a blocking root cause.

Never tell the user to fix a casualty; that is the whole point of this tool.
