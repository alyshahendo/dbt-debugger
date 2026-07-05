"""Unit tests for the root-cause/casualty classifier."""

from __future__ import annotations

import json
from pathlib import Path

from dbt_debug.classifier import classify
from dbt_debug.parser import (
    ParsedArtifacts,
    ParsedModel,
    ParsedResult,
    ParsedTest,
    parse_artifacts,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "jaffle_shop"


def make(
    deps: dict[str, list[str]],
    statuses: dict[str, str],
    command: str = "build",
    tests: dict[str, tuple[str, str]] | None = None,
    test_results: dict[str, str] | None = None,
) -> ParsedArtifacts:
    models = {
        uid: ParsedModel(uid, uid, None, None, [], parents)
        for uid, parents in deps.items()
    }
    results = {uid: ParsedResult(uid, st) for uid, st in statuses.items()}
    parsed_tests: dict[str, ParsedTest] = {}
    for tuid, (attached, ttype) in (tests or {}).items():
        parsed_tests[tuid] = ParsedTest(tuid, tuid, ttype, None, attached, [attached])
    for tuid, st in (test_results or {}).items():
        results[tuid] = ParsedResult(tuid, st, failures=1)
    return ParsedArtifacts(
        invocation_id="t",
        command=command,
        models=models,
        tests=parsed_tests,
        results=results,
    )


def test_error_is_root_skipped_descendants_are_casualties():
    arts = make(
        deps={"a": [], "b": ["a"], "c": ["b"]},
        statuses={"a": "error", "b": "skipped", "c": "skipped"},
    )
    res = classify(arts)
    assert res["a"].failure_class == "root_cause"
    assert res["a"].blamed_root_cause_unique_id == "a"
    assert res["b"].failure_class == "casualty"
    assert res["b"].blamed_root_cause_unique_id == "a"
    # nearest-root attribution reaches across the skipped intermediate
    assert res["c"].failure_class == "casualty"
    assert res["c"].blamed_root_cause_unique_id == "a"


def test_failed_test_gates_downstream_in_build():
    arts = make(
        deps={"a": [], "b": ["a"]},
        statuses={"a": "success", "b": "skipped"},
        command="build",
        tests={"t1": ("a", "unique")},
        test_results={"t1": "fail"},
    )
    res = classify(arts)
    assert res["a"].failure_class == "root_cause"  # its failing test is the cause
    assert res["b"].failure_class == "casualty"
    assert res["b"].blamed_root_cause_unique_id == "a"


def test_warn_test_does_not_gate():
    arts = make(
        deps={"a": [], "b": ["a"]},
        statuses={"a": "success", "b": "success"},
        command="build",
        tests={"t1": ("a", "unique")},
        test_results={"t1": "warn"},
    )
    res = classify(arts)
    assert res["a"].failure_class == "ok"
    assert res["b"].failure_class == "ok"


def test_test_gating_only_in_build_not_run():
    # Same failed test, but command=test (no model gating semantics here).
    arts = make(
        deps={"a": [], "b": ["a"]},
        statuses={"a": "success", "b": "success"},
        command="test",
        tests={"t1": ("a", "unique")},
        test_results={"t1": "fail"},
    )
    res = classify(arts)
    assert res["a"].failure_class == "ok"
    assert res["b"].failure_class == "ok"


def test_fail_fast_orphan_skips_are_unattributed():
    # x errored elsewhere; a/b were skipped with no failed ancestor of their own.
    arts = make(
        deps={"x": [], "a": [], "b": ["a"]},
        statuses={"x": "error", "a": "skipped", "b": "skipped"},
    )
    res = classify(arts)
    assert res["x"].failure_class == "root_cause"
    assert res["a"].failure_class == "skipped"
    assert res["a"].blamed_root_cause_unique_id is None
    assert res["b"].failure_class == "skipped"


def test_multiple_independent_root_causes():
    arts = make(
        deps={"a": [], "b": ["a"], "x": [], "y": ["x"]},
        statuses={"a": "error", "b": "skipped", "x": "error", "y": "skipped"},
    )
    res = classify(arts)
    assert res["b"].blamed_root_cause_unique_id == "a"
    assert res["y"].blamed_root_cause_unique_id == "x"


def test_jaffle_shop_fixture_end_to_end():
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    run_results = json.loads((FIXTURES / "run_results.json").read_text())
    arts = parse_artifacts(manifest, run_results)
    res = classify(arts)

    def fc(name: str) -> str:
        return res[f"model.jaffle_shop.{name}"].failure_class

    def blame(name: str):
        return res[f"model.jaffle_shop.{name}"].blamed_root_cause_unique_id

    assert fc("stg_orders") == "root_cause"
    assert fc("stg_customers") == "ok"
    assert fc("stg_payments") == "ok"  # only a warn test, not blocking
    for downstream in ("customers", "orders", "order_items"):
        assert fc(downstream) == "casualty"
        assert blame(downstream) == "model.jaffle_shop.stg_orders"
