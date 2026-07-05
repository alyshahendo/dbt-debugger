# dbt-debugger

> Turn a failed `dbt` run into an interactive lineage map that tells you **what actually broke** — not just what got skipped.

## ✨ Highlights

- 🎯 **Finds the real culprit** — classifies every node in a failed run as a **root cause** or a downstream **casualty**, so you fix the one thing that matters.
- 🗺️ **Interactive lineage view** — models laid out in lanes (sources → staging → intermediate → marts → reporting) with a glowing failure cascade, a click-to-open detail drawer, a "failure paths only" toggle, and a stepper that walks you through each root cause.
- ✅ **Tests & freshness in context** — rolls up dbt test results per model, shows source freshness when `sources.json` is present, and lets you expand a failing test's **compiled query** (copy it to pull the failing rows).
- 🤖 **Claude Code skill** — run it inside Claude Code and it diagnoses the failure for you: reads the SQL + dbt error, explains each root cause, and embeds that analysis directly in the map.
- 📄 **One self-contained HTML file** — no server, no database, nothing to host. Easy to share, attach to an incident, or drop in a PR.
- 🧪 **Bundled examples** — try it in one command without a dbt project of your own.

## 🔎 Overview

When a `dbt run` or `dbt build` fails, `run_results.json` hands you a flat list of errors and skips. The hard part is separating the *one* model that genuinely failed from the dozens of downstream models dbt skipped **because** of it. dbt-debugger reads your run artifacts, walks the DAG, and renders a single interactive HTML page that makes the blast radius obvious at a glance.

### How it decides what broke

The classifier leans on dbt's own execution semantics rather than guessing:

- `status=error` means the node actually ran (its parents were fine) → **root cause**.
- `status=skipped` means dbt blocked it because something upstream failed → **casualty**, attributed to its nearest failed ancestor.
- In `dbt build`, a failed test gates the models below it, so its attached model is treated as the blocking root cause.

### Where it fits

dbt-debugger is a standalone Python CLI (and Claude Code skill) that works with the artifacts any dbt Core or dbt Cloud run already produces — `manifest.json`, `run_results.json`, and optionally `sources.json`. It reads them read-only; it never touches your warehouse or your project. Built by [Alysha Henderson](https://github.com/alyshahendo).

## 📦 Installation

Requires **Python 3.11+**. Works on macOS, Linux, and Windows.

```bash
git clone https://github.com/alyshahendo/dbt-debugger.git
pipx install ./dbt-debugger/backend      # or: pip install ./dbt-debugger/backend
```

This puts a `dbt-debug` command on your PATH. (Node is **not** required — the UI ships prebuilt. It's only needed to change the frontend; see [Contributing](#-contributing).)

## 🚀 Usage

Try it right now against a bundled example — no dbt project required:

```bash
dbt-debug --example        # a stg_payments build-failure cascade
dbt-debug --example-test   # a failing dbt test example
dbt-debug --example-run    # a dbt run failure cascade
```

Point it at your own run:

```bash
# Auto-detects ./target, or pass one explicitly
dbt-debug --target path/to/target

# ...or pass explicit artifact files
dbt-debug --manifest manifest.json --run-results run_results.json --sources sources.json
```

Each run writes `dbt-debug-lineage.html` and opens it in your browser.

| Flag | Description |
| --- | --- |
| `--target <dir>` | Path to a dbt `target/` directory |
| `--manifest / --run-results / --sources` | Explicit artifact file paths |
| `--example`, `--example-test`, `--example-run` | Render a bundled fixture |
| `--analysis <json>` | Map of node id/name → explanation, shown inline in the drawer |
| `--out <path>` | Output HTML path (default `./dbt-debug-lineage.html`) |
| `--no-open` | Don't open the browser automatically |

Prefer to work with the graph directly? Use it as a library:

```python
from dbt_debug.engine import analyze_target

graph = analyze_target("path/to/target")   # -> JSON-able failure graph
```

## 🤖 As a Claude Code skill

The repo ships a skill at `.claude/skills/dbt-debugger/`. When you're working in a dbt
project inside Claude Code and a run fails (or you ask "why did my build fail / what
actually broke"), Claude picks up the skill and:

1. runs the analyzer to find the root cause(s) and blast radius,
2. reads each failing model's SQL and dbt error and works out *why* it broke,
3. re-renders the map with that analysis embedded (via `--analysis`), and
4. explains it in the terminal — always pointing you at the real culprit, never a casualty.

So you get both the visual map and a plain-language fix, without leaving the terminal.

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome — open an [issue](https://github.com/alyshahendo/dbt-debugger/issues) to start a discussion before substantial changes, and keep pull requests focused.

Set up for development (editable install with test deps):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Tests live in `backend/tests/` and cover the parser, classifier, engine, and CLI rendering against the fixtures in `fixtures/`.

The interactive UI is a **Preact + Vite** app in `frontend/`, bundled into a single
self-contained shell at `backend/dbt_debug/web/index.html` that the renderer injects the
graph into. If you change the UI, rebuild and commit that shell:

```bash
cd frontend
npm install
npm run build     # writes backend/dbt_debug/web/index.html
```

## 🗺️ Roadmap

- dbt Cloud artifact resolver (the `DbtCloudSource` contract is stubbed in `artifact_sources.py`).
- Shakeout against real-world dbt projects (current test coverage is against synthetic fixtures).

## 📄 License

Released under the [MIT License](LICENSE).
