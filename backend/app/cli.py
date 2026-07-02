"""dbt-debug CLI — the skill's entry point.

Resolve dbt artifacts (local target/, explicit files, or the bundled example),
run the classifier engine, and render a self-contained lineage HTML you open in
the browser.

    python -m app.cli --example
    python -m app.cli --target path/to/target
    python -m app.cli --manifest m.json --run-results rr.json [--sources s.json]
"""

from __future__ import annotations

import argparse
import webbrowser
from pathlib import Path

from .artifact_sources import DirectFilesSource, LocalTargetSource, resolve_source
from .engine import analyze
from .render import render_html

_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
_BUNDLED_EXAMPLE = _FIXTURES / "jaffle_shop_demo"
_BUNDLED_TEST_EXAMPLE = _FIXTURES / "jaffle_shop_test"


def build_source(args: argparse.Namespace):
    if args.example_test:
        return LocalTargetSource(_BUNDLED_TEST_EXAMPLE)
    if args.example:
        return LocalTargetSource(_BUNDLED_EXAMPLE)
    if args.manifest and args.run_results:
        return DirectFilesSource(args.manifest, args.run_results, args.sources)
    return resolve_source(target=args.target)


def run(args: argparse.Namespace) -> Path:
    graph = analyze(build_source(args))
    html = render_html(graph)
    out = Path(args.out) if args.out else Path.cwd() / "dbt-debug-lineage.html"
    out.write_text(html)
    return out


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="dbt-debug", description="Visualize a dbt run failure.")
    p.add_argument("--target", help="path to a dbt target/ directory")
    p.add_argument("--manifest", help="path to manifest.json")
    p.add_argument("--run-results", dest="run_results", help="path to run_results.json")
    p.add_argument("--sources", help="path to sources.json (freshness), optional")
    p.add_argument("--example", action="store_true", help="bundled build example (stg_payments cascade)")
    p.add_argument("--example-test", dest="example_test", action="store_true", help="bundled dbt test example (failing tests)")
    p.add_argument("--out", help="output HTML path (default: ./dbt-debug-lineage.html)")
    p.add_argument("--no-open", action="store_true", help="don't open the browser")
    args = p.parse_args(argv)

    out = run(args)
    print(f"lineage written to {out}")
    if not args.no_open:
        webbrowser.open(out.resolve().as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
