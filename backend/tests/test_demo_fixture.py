"""Locks the 15-model demo fixture to the intended stg_payments-drift story."""

from __future__ import annotations

from pathlib import Path

from app.engine import analyze_target

DEMO = Path(__file__).resolve().parents[2] / "fixtures" / "jaffle_shop_demo"


def test_demo_matches_design_story():
    g = analyze_target(DEMO)
    s = g["summary"]

    assert g["command"] == "build"
    assert s["models"] == 15
    assert s["sources"] == 5

    # a real build shows all three failure kinds at once
    assert "model.jaffle_shop.stg_payments" in s["root_causes"]  # model error
    assert s["failing_tests"] == 1  # dim_products test failed
    assert s["stale_sources"] == 1  # raw.payments stale

    by_name = {n["id"].split(".")[-1]: n for n in g["nodes"] if n["resource_type"] == "model"}
    casualties = {
        "int_payments_enriched",
        "fct_orders",
        "fct_payments",
        "fct_revenue_daily",
    }
    for name in casualties:
        assert by_name[name]["failure_class"] == "casualty"
        assert by_name[name]["blamed_root_cause"] == "model.jaffle_shop.stg_payments"

    # stg_payments errored; dim_products is a leaf gated only by its failing test
    assert by_name["stg_payments"]["status"] == "error"
    assert by_name["dim_products"]["test_status"] == "fail"


def test_demo_freshness_overlay():
    g = analyze_target(DEMO)
    assert g["summary"]["stale_sources"] == 1
    payments = next(n for n in g["nodes"] if n["id"].endswith("raw.payments"))
    assert payments["freshness_status"] == "warn"


def test_model_columns_and_build_time_in_graph():
    g = analyze_target(DEMO)
    stg = next(n for n in g["nodes"] if n["id"].endswith("stg_customers"))

    names = [c["name"] for c in stg["columns"]]
    assert "customer_id" in names
    assert all("data_type" in c for c in stg["columns"])
    # completed_at is lifted from the run_results timing so the drawer can date the build
    assert stg["completed_at"]


def test_source_columns_flow_through():
    g = analyze_target(DEMO)
    payments = next(n for n in g["nodes"] if n["id"].endswith("raw.payments"))
    cols = {c["name"]: c["data_type"] for c in payments["columns"]}
    assert cols["payment_id"] == "integer"
    assert cols["amount"] == "double"


def test_failing_test_carries_type_for_labeling():
    g = analyze_target(DEMO)
    dim_products = next(n for n in g["nodes"] if n["id"].endswith("dim_products"))
    failing = [t for t in dim_products["tests"] if t["status"] == "fail"]
    assert failing and failing[0]["test_type"] == "not_null"
