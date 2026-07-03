# dbt-debugger

> Turn a failed `dbt` run into an interactive lineage map that tells you **what actually broke** — not just what got skipped.

## ✨ Highlights

- 🎯 **Finds the real culprit** — classifies every node in a failed run as a **root cause** or a downstream **casualty**, so you fix the one thing that matters.
- 🗺️ **Interactive lineage view** — models laid out in lanes (sources → staging → intermediate → marts → reporting) with a glowing failure cascade, a click-to-open detail drawer, a "failure path only" toggle, and a stepper that walks you through each root cause.
- ✅ **Tests & freshness in context** — rolls up dbt test results per model and shows source freshness when `sources.json` is present.
- 📄 **One self-contained HTML file** — no server, no database, no build step. Easy to share, attach to an incident, or drop in a PR.
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

## 🚀 Usage

Try it right now against a bundled example — no dbt project required:

```bash
python -m app.cli --example        # a stg_payments build-failure cascade
python -m app.cli --example-test   # a failing dbt test example
```

Point it at your own run:

```bash
# Auto-detects ./target, or pass one explicitly
python -m app.cli --target path/to/target

# ...or pass explicit artifact files
python -m app.cli --manifest manifest.json --run-results run_results.json --sources sources.json
```

Each run writes `dbt-debug-lineage.html` and opens it in your browser.

| Flag | Description |
| --- | --- |
| `--target <dir>` | Path to a dbt `target/` directory |
| `--manifest / --run-results / --sources` | Explicit artifact file paths |
| `--example`, `--example-test` | Render a bundled fixture |
| `--out <path>` | Output HTML path (default `./dbt-debug-lineage.html`) |
| `--no-open` | Don't open the browser automatically |

Prefer to work with the graph directly? Use it as a library:

```python
from app.engine import analyze_target

graph = analyze_target("path/to/target")   # -> JSON-able failure graph
```

## 📦 Installation

Requires **Python 3.11+**. Works on macOS, Linux, and Windows.

```bash
git clone https://github.com/alyshahendo/dbt-debugger.git
cd dbt-debugger/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Then run any command from the [Usage](#-usage) section inside `backend/`.

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome — open an [issue](https://github.com/alyshahendo/dbt-debugger/issues) to start a discussion before substantial changes, and keep pull requests focused.

To run the test suite:

```bash
cd backend
pip install -r requirements.txt
pytest
```

Tests live in `backend/tests/` and cover the parser, classifier, engine, and CLI rendering against the fixtures in `fixtures/`.

## 🗺️ Roadmap

- dbt Cloud artifact resolver (the `DbtCloudSource` contract is stubbed in `artifact_sources.py`).
- "Ask Claude" on a failing node — inline explanation of a specific failure (UI placeholder is in place).

## 📄 License

Released under the [MIT License](LICENSE).
