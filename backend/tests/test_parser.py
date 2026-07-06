"""Parser-level tests, including test-to-model attachment."""

from __future__ import annotations

from dbt_debug.parser import parse_manifest, parse_run_results


def test_run_results_normalize_compiled_sql():
    # dbt leaves a test's manifest compiled_code null; the real query is in run_results,
    # padded with blank lines and no trailing semicolon. We collapse and terminate it.
    rr = {
        "args": {"which": "build"},
        "results": [
            {
                "unique_id": "test.p.u",
                "status": "fail",
                "compiled_code": "\n    \n\nselect 1\n\nfrom t\nhaving count(*) > 1\n\n\n",
            }
        ],
    }
    _, results = parse_run_results(rr)
    assert results["test.p.u"].compiled_sql == "select 1\nfrom t\nhaving count(*) > 1;"


def test_run_results_blank_compiled_sql_is_none():
    rr = {"args": {"which": "build"}, "results": [{"unique_id": "m.p.x", "status": "success", "compiled_code": "\n\n"}]}
    _, results = parse_run_results(rr)
    assert results["m.p.x"].compiled_sql is None


def _manifest(nodes):
    return {"nodes": nodes}


def test_relationships_test_attaches_to_declared_model():
    # depends_on lists the referenced parent (dim_customers) first, but the test
    # is declared on fct_orders. attached_node must win.
    manifest = _manifest({
        "model.p.fct_orders": {"resource_type": "model", "name": "fct_orders", "depends_on": {"nodes": []}},
        "model.p.dim_customers": {"resource_type": "model", "name": "dim_customers", "depends_on": {"nodes": []}},
        "test.p.rel": {
            "resource_type": "test",
            "name": "relationships_fct_orders_customer_id",
            "attached_node": "model.p.fct_orders",
            "depends_on": {"nodes": ["model.p.dim_customers", "model.p.fct_orders"]},
            "test_metadata": {"name": "relationships"},
        },
    })
    _, tests = parse_manifest(manifest)
    assert tests["test.p.rel"].attached_model_unique_id == "model.p.fct_orders"


def test_test_without_attached_node_falls_back_to_depends_on():
    manifest = _manifest({
        "model.p.stg": {"resource_type": "model", "name": "stg", "depends_on": {"nodes": []}},
        "test.p.nn": {
            "resource_type": "test",
            "name": "not_null_stg_id",
            "depends_on": {"nodes": ["model.p.stg"]},
            "test_metadata": {"name": "not_null"},
        },
    })
    _, tests = parse_manifest(manifest)
    assert tests["test.p.nn"].attached_model_unique_id == "model.p.stg"
