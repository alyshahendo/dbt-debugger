"""Tests for the engine library: artifacts dir -> failure-graph JSON."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dbt_debug.engine import analyze_target, build_graph, derive_lanes
from dbt_debug.parser import ParsedModel, parse_artifacts

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "jaffle_shop"


def _graph_from_fixture() -> dict:
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    run_results = json.loads((FIXTURES / "run_results.json").read_text())
    return build_graph(parse_artifacts(manifest, run_results))


def test_graph_shape_and_root_cause():
    g = _graph_from_fixture()
    assert g["command"] == "build"
    by_id = {n["id"]: n for n in g["nodes"]}

    stg_orders = by_id["model.jaffle_shop.stg_orders"]
    assert stg_orders["failure_class"] == "root_cause"

    for downstream in ("customers", "orders", "order_items"):
        node = by_id[f"model.jaffle_shop.{downstream}"]
        assert node["failure_class"] == "casualty"
        assert node["blamed_root_cause"] == "model.jaffle_shop.stg_orders"

    # summary counts line up with the story
    assert g["summary"]["root_causes"] == ["model.jaffle_shop.stg_orders"]
    assert g["summary"]["by_failure_class"].get("casualty") == 3


def test_edges_only_between_present_nodes():
    g = _graph_from_fixture()
    node_ids = {n["id"] for n in g["nodes"]}
    for e in g["edges"]:
        assert e["source"] in node_ids
        assert e["target"] in node_ids


def test_lane_assignment_by_naming():
    models = {
        "m.stg_orders": ParsedModel("m.stg_orders", "stg_orders", None, None, [], []),
        "m.int_x": ParsedModel("m.int_x", "int_orders_joined", None, None, [], ["m.stg_orders"]),
        "m.fct_x": ParsedModel("m.fct_x", "fct_orders", None, None, [], ["m.int_x"]),
        "m.weird": ParsedModel("m.weird", "some_model", None, None, [], ["m.fct_x"]),
    }
    lanes = derive_lanes(models)
    assert lanes["m.stg_orders"] == 1  # staging
    assert lanes["m.int_x"] == 2  # intermediate
    assert lanes["m.fct_x"] == 3  # marts
    # unnamed model falls back to depth (3 hops from a root -> clamped into range)
    assert 1 <= lanes["m.weird"] <= 4


def test_analyze_target_reads_directory():
    g = analyze_target(FIXTURES)
    assert g["nodes"] and g["edges"]
    assert g["summary"]["models"] == 6


def test_analyze_target_missing_artifact(tmp_path):
    with pytest.raises(FileNotFoundError):
        analyze_target(tmp_path)
