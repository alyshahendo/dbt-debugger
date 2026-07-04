from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from .classifier import classify
from .parser import ParsedArtifacts, ParsedModel, parse_artifacts

if TYPE_CHECKING:
    from .artifact_sources import ArtifactSource


_LANE_SOURCES, _LANE_STAGING, _LANE_INTERMEDIATE, _LANE_MARTS, _LANE_REPORTING = range(5)

_NAME_LANES: list[tuple[tuple[str, ...], int]] = [
    (("stg_", "staging_", "base_"), _LANE_STAGING),
    (("int_", "intermediate_"), _LANE_INTERMEDIATE),
    (("fct_", "fact_", "dim_", "mart_", "agg_"), _LANE_MARTS),
    (("rpt_", "report_", "reporting_"), _LANE_REPORTING),
]


def _lane_from_name(name: str) -> Optional[int]:
    lowered = name.lower()
    for prefixes, lane in _NAME_LANES:
        if lowered.startswith(prefixes):
            return lane
    return None


def derive_lanes(models: dict[str, ParsedModel]) -> dict[str, int]:
    """Lane by naming convention first; fall back to graph depth for models
    that don't follow the stg_/int_/fct_ convention."""
    lanes: dict[str, int] = {}

    @lru_cache(maxsize=None)
    def depth(uid: str) -> int:
        parents = [p for p in models[uid].depends_on if p in models]
        if not parents:
            return 0
        return 1 + max(depth(p) for p in parents)

    for uid, model in models.items():
        named = _lane_from_name(model.name)
        if named is not None:
            lanes[uid] = named
        else:
            lanes[uid] = min(_LANE_STAGING + depth(uid), _LANE_REPORTING)

    for uid in sorted(models, key=depth):
        parents = [p for p in models[uid].depends_on if p in models]
        if parents:
            lanes[uid] = min(
                max(lanes[uid], max(lanes[p] for p in parents) + 1), _LANE_REPORTING
            )
    return lanes


def build_graph(artifacts: ParsedArtifacts) -> dict:
    classifications = classify(artifacts)
    lanes = derive_lanes(artifacts.models)
    status_of = {
        uid: artifacts.results[uid].status
        for uid in artifacts.models
        if uid in artifacts.results
    }

    tests_by_model: dict[str, list[dict]] = {}
    for tuid, test in artifacts.tests.items():
        model_uid = test.attached_model_unique_id
        if model_uid is None or model_uid not in artifacts.models:
            continue
        res = artifacts.results.get(tuid)
        tests_by_model.setdefault(model_uid, []).append(
            {
                "unique_id": tuid,
                "name": test.name,
                "test_type": test.test_type,
                "column_name": test.column_name,
                "status": res.status if res else None,
                "failures": res.failures if res else None,
                "message": res.message if res else None,
            }
        )

    nodes: list[dict] = []

    referenced_sources = {
        s for m in artifacts.models.values() for s in m.source_deps
    }
    for uid in sorted(referenced_sources):
        src = artifacts.sources.get(uid)
        if src is None:
            continue
        fresh = src.freshness or {}
        nodes.append(
            {
                "id": uid,
                "name": src.name,
                "resource_type": "source",
                "schema": src.schema_name,
                "lane": _LANE_SOURCES,
                "freshness_status": fresh.get("status"),
                "freshness_age_seconds": fresh.get("age_seconds"),
                "columns": src.columns,
            }
        )

    for uid, model in artifacts.models.items():
        c = classifications[uid]
        res = artifacts.results.get(uid)
        model_tests = tests_by_model.get(uid, [])
        nodes.append(
            {
                "id": uid,
                "name": model.name,
                "resource_type": "model",
                "schema": model.schema_name,
                "materialization": model.materialization,
                "tags": model.tags,
                "path": model.path,
                "lane": lanes[uid],
                "status": status_of.get(uid),
                "failure_class": c.failure_class,
                "blamed_root_cause": c.blamed_root_cause_unique_id,
                "execution_time": res.execution_time if res else None,
                "completed_at": res.completed_at if res else None,
                "message": res.message if res else None,
                "columns": model.columns,
                "tests": model_tests,
                "test_status": _rollup_test_status(model_tests),
            }
        )

    node_ids = {n["id"] for n in nodes}
    edges: list[dict] = []
    for uid, model in artifacts.models.items():
        for parent in (*model.depends_on, *model.source_deps):
            if parent in node_ids and uid in node_ids:
                edges.append({"source": parent, "target": uid})

    return {
        "command": artifacts.command,
        "selection": artifacts.selection,
        "invocation_id": artifacts.invocation_id,
        "nodes": nodes,
        "edges": edges,
        "summary": _summarize(nodes),
    }


def _rollup_test_status(tests: list[dict]) -> Optional[str]:
    statuses = {t["status"] for t in tests}
    for worst in ("error", "fail", "warn", "pass"):
        if worst in statuses:
            return worst
    return None


def _summarize(nodes: list[dict]) -> dict:
    models = [n for n in nodes if n["resource_type"] == "model"]
    sources = [n for n in nodes if n["resource_type"] == "source"]
    fc: dict[str, int] = {}
    for n in models:
        fc[n["failure_class"]] = fc.get(n["failure_class"], 0) + 1
    root_causes = [n["id"] for n in models if n["failure_class"] == "root_cause"]
    failing_tests = sum(
        1 for n in models for t in n["tests"] if t["status"] in ("fail", "error")
    )
    stale_sources = sum(
        1 for n in sources if n.get("freshness_status") in ("warn", "error")
    )
    return {
        "models": len(models),
        "sources": len(sources),
        "by_failure_class": fc,
        "root_causes": root_causes,
        "failing_tests": failing_tests,
        "stale_sources": stale_sources,
    }


def analyze(source: "ArtifactSource") -> dict:
    raw = source.resolve()
    artifacts = parse_artifacts(raw.manifest, raw.run_results, raw.sources_results)
    return build_graph(artifacts)


def analyze_target(target_dir: str | Path) -> dict:
    from .artifact_sources import LocalTargetSource

    return analyze(LocalTargetSource(target_dir))
