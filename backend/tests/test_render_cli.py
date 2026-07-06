"""Smoke tests for the HTML renderer and the CLI."""

from __future__ import annotations

import json
from pathlib import Path

from dbt_debug.cli import main
from dbt_debug.engine import analyze_target
from dbt_debug.render import render_html

_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
DEMO = _FIXTURES / "jaffle_shop_demo"
RUN = _FIXTURES / "jaffle_shop_run"
TEST = _FIXTURES / "jaffle_shop_test"


def _source_args(fixture: Path) -> list[str]:
    """CLI args pointing at a fixture dir's artifacts (sources.json if present)."""
    args = [
        "--manifest", str(fixture / "manifest.json"),
        "--run-results", str(fixture / "run_results.json"),
    ]
    sources = fixture / "sources.json"
    if sources.is_file():
        args += ["--sources", str(sources)]
    return args


def _embedded_graph(html: str) -> dict:
    """Pull the graph out of the injected <script id="graph-data"> block."""
    marker = 'id="graph-data">'
    start = html.index(marker) + len(marker)
    end = html.index("</script>", start)
    return json.loads(html[start:end])


def test_render_html_is_self_contained_and_has_data():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    assert html.lower().startswith("<!doctype html>")
    assert "stg_payments" in html  # a node made it into the embedded JSON
    assert "n-root" in html and "n-cas" in html  # status styles present
    # the graph JSON is embedded, not fetched
    assert "__GRAPH_JSON__" not in html
    assert "fetch(" not in html


def test_render_embedded_json_parses():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    embedded = _embedded_graph(html)
    assert "model.jaffle_shop.stg_payments" in embedded["summary"]["root_causes"]


def test_render_embeds_column_and_test_label_helpers():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    # the drawer builds columns and humanized test labels client-side
    assert "Columns" in html
    assert "not null" in html


def test_source_columns_reach_embedded_json():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    embedded = _embedded_graph(html)
    payments = next(n for n in embedded["nodes"] if n["id"].endswith("raw.payments"))
    assert any(c["name"] == "payment_id" for c in payments["columns"])


def test_cli_writes_html(tmp_path):
    out = tmp_path / "lineage.html"
    code = main(_source_args(DEMO) + ["--out", str(out), "--no-open"])
    assert code == 0
    assert out.is_file()
    assert "dbt-debug · Lineage" in out.read_text()


def test_cli_test_fixture_is_a_test_run(tmp_path):
    out = tmp_path / "test-lineage.html"
    code = main(_source_args(TEST) + ["--out", str(out), "--no-open"])
    assert code == 0
    graph = _embedded_graph(out.read_text())
    assert graph["command"] == "test"
    assert graph["summary"]["failing_tests"] == 3


def test_analysis_is_embedded_by_node_name(tmp_path):
    ann = tmp_path / "analysis.json"
    ann.write_text(json.dumps({"stg_payments": "root-cause explanation from Claude"}))
    out = tmp_path / "analyzed.html"
    code = main(_source_args(DEMO) + ["--analysis", str(ann), "--out", str(out), "--no-open"])
    assert code == 0
    graph = _embedded_graph(out.read_text())
    node = next(n for n in graph["nodes"] if n["name"] == "stg_payments")
    assert node["analysis"] == "root-cause explanation from Claude"


def test_analysis_can_be_read_from_stdin(tmp_path, monkeypatch):
    import io

    monkeypatch.setattr(
        "sys.stdin", io.StringIO(json.dumps({"stg_payments": "piped in via stdin"}))
    )
    out = tmp_path / "analyzed-stdin.html"
    code = main(_source_args(DEMO) + ["--analysis", "-", "--out", str(out), "--no-open"])
    assert code == 0
    graph = _embedded_graph(out.read_text())
    node = next(n for n in graph["nodes"] if n["name"] == "stg_payments")
    assert node["analysis"] == "piped in via stdin"


def test_cli_run_fixture_is_a_run_failure(tmp_path):
    out = tmp_path / "run-lineage.html"
    code = main(_source_args(RUN) + ["--out", str(out), "--no-open"])
    assert code == 0
    graph = _embedded_graph(out.read_text())
    assert graph["command"] == "run"
    # a model errored and gated its downstream; no tests ran
    assert graph["summary"]["root_causes"] == ["model.jaffle_shop.stg_orders"]
    assert graph["summary"]["by_failure_class"].get("casualty") == 5
    assert graph["summary"]["failing_tests"] == 0
