# dbt-debugger

> Turn a failed `dbt` run into an interactive lineage map that tells you **what actually broke**, not just what got skipped.

A Claude Code skill. When a dbt run fails, Claude finds the model that actually broke (versus the ones that were only skipped downstream), explains why, and renders an interactive map of the blast radius.

## ✨ Highlights

- 🎯 **Finds the real culprit.** Classifies every node in a failed run as a **root cause**, a downstream **casualty**, or a **suspect** (an inlined ephemeral that may be hiding the bug), so you fix the one thing that matters.
- 🤖 **Claude explains it.** Claude reads the failing model's SQL and the dbt error, works out why it broke, embeds that analysis in the map, and walks you through the fix in the terminal.
- 🗺️ **Interactive lineage view.** Models laid out in lanes (sources, staging, intermediate, marts, reporting) with a glowing failure cascade, a click-to-open detail drawer, a "failure paths only" toggle, and a stepper through each root cause.
- ✅ **Tests & freshness in context.** Rolls up dbt test results per model, shows source freshness and the stale threshold it was checked against when `sources.json` is present, and lets you expand a failing test's **compiled query** (copy it to pull the failing rows).
- 📄 **One self-contained HTML file.** No server, no database, nothing to host. Easy to share, attach to an incident, or drop in a PR.

## 🔎 How it decides what broke

When a `dbt run` or `dbt build` fails, `run_results.json` hands you a flat list of errors and skips. The hard part is separating the *one* model that genuinely failed from the dozens of downstream models dbt skipped **because** of it. The classifier leans on dbt's own execution semantics rather than guessing:

- `status=error` means the node actually ran (its parents were fine), so it is a **root cause**.
- `status=skipped` means dbt blocked it because something upstream failed, so it is a **casualty**, attributed to its nearest failed ancestor.
- In `dbt build`, a failed test gates the models below it, so its attached model is treated as the blocking root cause.
- An **ephemeral** model never runs on its own; dbt inlines it into its consumers, so a bug in it surfaces on the model that inlines it. If it feeds an errored model, it is flagged a **suspect** rather than shown as passing, so you look where the bug actually lives.

It reads `manifest.json`, `run_results.json`, and optionally `sources.json` read-only. It never touches your warehouse or your project.

### dbt Core or dbt Cloud?

The artifacts (`manifest.json`, `run_results.json`) are the same format either way, so both work. The difference is how you get them to the tool:

- **dbt Core:** they are already in your `target/` directory after a run, so point the skill straight at it.
- **dbt Cloud:** you download the run's artifacts first (from the run page or the Admin API), then point the skill at the downloaded files. There is no automatic fetch today; an API resolver is on the [roadmap](#️-roadmap).

## 📦 Installation

Requires **Python 3.11+** and [pipx](https://pipx.pypa.io/). Works on macOS, Linux, and Windows.

```bash
git clone https://github.com/alyshahendo/dbt-debugger.git
cd dbt-debugger
./install.sh
```

`install.sh` installs the engine and the Claude Code skill. It asks whether you want the skill **global** (`~/.claude/skills`, available in every project) or scoped to **one project**. Node is not required; the UI ships prebuilt. It is only needed to change the frontend (see [Contributing](#-contributing)).

## 🤖 Using it

Install the skill globally, then work in any dbt project. When a run fails, or you ask Claude "why did my build fail" or "what actually broke", Claude picks up the skill and:

1. inspects the failure graph to find the root cause(s) and blast radius,
2. reads each failing model's SQL and dbt error and works out why it broke,
3. renders the map with that analysis embedded, and
4. explains it in the terminal, always pointing you at the real culprit, never a casualty.

You get both the visual map and a plain-language fix, without leaving the terminal.

### Under the hood

The skill drives a small command, `dbt-debug`, that does the read-only rendering. You rarely call it yourself, but you can if you only want the map (for example, to attach to a CI build). On its own it does not use Claude; the analysis appears only when the skill supplies it.

```bash
dbt-debug --target path/to/target                  # render the map from a target/ dir
dbt-debug --manifest m.json --run-results rr.json  # or explicit artifact files
dbt-debug --json                                   # print the failure graph as JSON
```

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome. Open an [issue](https://github.com/alyshahendo/dbt-debugger/issues) to start a discussion before substantial changes, and keep pull requests focused.

Set up for development (editable install with test deps):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Tests live in `backend/tests/` and cover the parser, classifier, engine, and CLI rendering against the fixtures in `fixtures/`.

The interactive UI is a **Preact + Vite** app in `frontend/`, bundled into a single self-contained shell at `backend/dbt_debug/web/index.html` that the renderer injects the graph into. If you change the UI, rebuild and commit that shell:

```bash
cd frontend
npm install
npm run build     # writes backend/dbt_debug/web/index.html
```

## 🗺️ Roadmap

- dbt Cloud artifact resolver, so you can point at a Cloud run without downloading the files yourself. (The `ArtifactSource` protocol in `artifact_sources.py` is the seam a resolver would plug into.)
- Shakeout against real-world dbt projects (current test coverage is against synthetic fixtures).

## 📄 License

Released under the [MIT License](LICENSE).
