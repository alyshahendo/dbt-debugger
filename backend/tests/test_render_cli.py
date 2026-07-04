"""Smoke tests for the HTML renderer and the CLI."""

from __future__ import annotations

import json
from pathlib import Path

from app.cli import main, run
from app.engine import analyze_target
from app.render import render_html

DEMO = Path(__file__).resolve().parents[2] / "fixtures" / "jaffle_shop_demo"


def test_render_html_is_self_contained_and_has_data():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    assert html.startswith("<!DOCTYPE html>")
    assert "stg_payments" in html  # a node made it into the embedded JSON
    assert "n-root" in html and "n-cas" in html  # status styles present
    # the graph JSON is embedded, not fetched
    assert "__GRAPH_JSON__" not in html
    assert "fetch(" not in html


def test_render_embedded_json_parses():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    marker = "const GRAPH = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    embedded = json.loads(html[start:end])
    assert "model.jaffle_shop.stg_payments" in embedded["summary"]["root_causes"]


def test_render_embeds_column_and_test_label_helpers():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    # the drawer builds columns and humanized test labels client-side
    assert "testLabel" in html
    assert "Columns" in html


def test_source_columns_reach_embedded_json():
    graph = analyze_target(DEMO)
    html = render_html(graph)
    marker = "const GRAPH = "
    start = html.index(marker) + len(marker)
    embedded = json.loads(html[start:html.index(";\n", start)])
    payments = next(n for n in embedded["nodes"] if n["id"].endswith("raw.payments"))
    assert any(c["name"] == "payment_id" for c in payments["columns"])


def test_cli_example_writes_html(tmp_path):
    out = tmp_path / "lineage.html"
    code = main(["--example", "--out", str(out), "--no-open"])
    assert code == 0
    assert out.is_file()
    assert "dbt-debug · Lineage" in out.read_text()


def test_cli_test_example_is_a_test_run(tmp_path):
    out = tmp_path / "test-lineage.html"
    code = main(["--example-test", "--out", str(out), "--no-open"])
    assert code == 0
    html = out.read_text()
    marker = "const GRAPH = "
    start = html.index(marker) + len(marker)
    graph = json.loads(html[start:html.index(";\n", start)])
    assert graph["command"] == "test"
    assert graph["summary"]["failing_tests"] == 3


def test_cli_run_example_is_a_run_failure(tmp_path):
    out = tmp_path / "run-lineage.html"
    code = main(["--example-run", "--out", str(out), "--no-open"])
    assert code == 0
    html = out.read_text()
    marker = "const GRAPH = "
    start = html.index(marker) + len(marker)
    graph = json.loads(html[start:html.index(";\n", start)])
    assert graph["command"] == "run"
    # a model errored and gated its downstream; no tests ran
    assert graph["summary"]["root_causes"] == ["model.jaffle_shop.stg_orders"]
    assert graph["summary"]["by_failure_class"].get("casualty") == 5
    assert graph["summary"]["failing_tests"] == 0
