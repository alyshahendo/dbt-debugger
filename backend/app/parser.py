"""Parse dbt `manifest.json` + `run_results.json` into plain structures.

These are pure functions over already-loaded dicts so they're trivial to unit
test. Persistence and classification happen elsewhere (ingest.py / classifier.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedModel:
    unique_id: str
    name: str
    schema_name: Optional[str]
    materialization: Optional[str]
    tags: list[str]
    depends_on: list[str]
    source_deps: list[str] = field(default_factory=list)
    path: Optional[str] = None
    columns: list[dict] = field(default_factory=list)


@dataclass
class ParsedSource:
    unique_id: str
    name: str
    schema_name: Optional[str]
    database: Optional[str]
    freshness: Optional[dict] = None
    columns: list[dict] = field(default_factory=list)


@dataclass
class ParsedTest:
    unique_id: str
    name: str
    test_type: Optional[str]
    column_name: Optional[str]
    attached_model_unique_id: Optional[str]
    depends_on: list[str]


@dataclass
class ParsedResult:
    unique_id: str
    status: str
    execution_time: Optional[float] = None
    message: Optional[str] = None
    failures: Optional[int] = None
    completed_at: Optional[str] = None


@dataclass
class ParsedArtifacts:
    invocation_id: Optional[str]
    command: Optional[str]
    models: dict[str, ParsedModel] = field(default_factory=dict)
    tests: dict[str, ParsedTest] = field(default_factory=dict)
    results: dict[str, ParsedResult] = field(default_factory=dict)
    sources: dict[str, ParsedSource] = field(default_factory=dict)
    selection: Optional[list[str]] = None


def _is_model(node: dict) -> bool:
    return node.get("resource_type") == "model"


def _is_test(node: dict) -> bool:
    return node.get("resource_type") in ("test", "generic_test", "singular_test")


def parse_sources(manifest: dict) -> dict[str, ParsedSource]:
    """Source definitions live in a top-level `sources` dict (not `nodes`)."""
    sources: dict[str, ParsedSource] = {}
    for uid, node in (manifest.get("sources") or {}).items():
        name = ".".join(
            p for p in (node.get("source_name"), node.get("name")) if p
        ) or node.get("name", uid.split(".")[-1])
        columns = [
            {"name": (meta or {}).get("name", cname), "data_type": (meta or {}).get("data_type")}
            for cname, meta in (node.get("columns") or {}).items()
        ]
        sources[uid] = ParsedSource(
            unique_id=uid,
            name=name,
            schema_name=node.get("schema"),
            database=node.get("database"),
            columns=columns,
        )
    return sources


def parse_manifest(manifest: dict) -> tuple[dict[str, ParsedModel], dict[str, ParsedTest]]:
    nodes: dict[str, dict] = manifest.get("nodes", {})
    model_ids = {uid for uid, n in nodes.items() if _is_model(n)}
    source_ids = set(manifest.get("sources") or {})

    models: dict[str, ParsedModel] = {}
    for uid in model_ids:
        node = nodes[uid]
        dep_nodes = node.get("depends_on", {}).get("nodes", [])
        depends = [d for d in dep_nodes if d in model_ids]
        src_deps = [d for d in dep_nodes if d in source_ids]
        columns = [
            {"name": (meta or {}).get("name", cname), "data_type": (meta or {}).get("data_type")}
            for cname, meta in (node.get("columns") or {}).items()
        ]
        models[uid] = ParsedModel(
            unique_id=uid,
            name=node.get("name", uid.split(".")[-1]),
            schema_name=node.get("schema"),
            materialization=node.get("config", {}).get("materialized"),
            tags=list(node.get("tags", []) or []),
            depends_on=depends,
            source_deps=src_deps,
            path=node.get("original_file_path") or node.get("path"),
            columns=columns,
        )

    tests: dict[str, ParsedTest] = {}
    for uid, node in nodes.items():
        if not _is_test(node):
            continue
        gated_models = [d for d in node.get("depends_on", {}).get("nodes", []) if d in model_ids]
        test_meta = node.get("test_metadata") or {}
        tests[uid] = ParsedTest(
            unique_id=uid,
            name=node.get("name", uid.split(".")[-1]),
            test_type=test_meta.get("name"),
            column_name=node.get("column_name"),
            attached_model_unique_id=gated_models[0] if gated_models else None,
            depends_on=gated_models,
        )

    return models, tests


def parse_run_results(run_results: dict) -> tuple[Optional[str], dict[str, ParsedResult]]:
    command = (run_results.get("args") or {}).get("which")
    results: dict[str, ParsedResult] = {}
    for r in run_results.get("results", []):
        uid = r.get("unique_id")
        if not uid:
            continue
        timing = r.get("timing") or []
        completed_at = next(
            (t.get("completed_at") for t in timing if t.get("name") == "execute" and t.get("completed_at")),
            timing[-1].get("completed_at") if timing else None,
        )
        results[uid] = ParsedResult(
            unique_id=uid,
            status=r.get("status", ""),
            execution_time=r.get("execution_time"),
            message=r.get("message"),
            failures=r.get("failures"),
            completed_at=completed_at,
        )
    return command, results


def parse_source_freshness(sources_results: dict) -> dict[str, dict]:
    """Parse an optional `sources.json` (from `dbt source freshness`).

    Returns a map of source unique_id -> {status, max_loaded_at, snapshotted_at,
    age_seconds}. Absent file / malformed input yields an empty map.
    """
    freshness: dict[str, dict] = {}
    for r in (sources_results or {}).get("results", []):
        uid = r.get("unique_id")
        if not uid:
            continue
        timing = r.get("timing") or []
        freshness[uid] = {
            "status": r.get("status"),
            "max_loaded_at": r.get("max_loaded_at"),
            "snapshotted_at": r.get("snapshotted_at"),
            "age_seconds": r.get("age") or r.get("max_loaded_at_time_ago_in_s"),
            "criteria": r.get("criteria"),
            "timing": timing,
        }
    return freshness


def parse_artifacts(
    manifest: dict, run_results: dict, sources_results: Optional[dict] = None
) -> ParsedArtifacts:
    models, tests = parse_manifest(manifest)
    sources = parse_sources(manifest)
    command, results = parse_run_results(run_results)
    args = run_results.get("args") or {}
    selection = args.get("select") or None

    if sources_results:
        freshness = parse_source_freshness(sources_results)
        for uid, fresh in freshness.items():
            if uid in sources:
                sources[uid].freshness = fresh

    invocation_id = (
        (run_results.get("metadata") or {}).get("invocation_id")
        or (manifest.get("metadata") or {}).get("invocation_id")
    )
    return ParsedArtifacts(
        invocation_id=invocation_id,
        command=command,
        models=models,
        tests=tests,
        results=results,
        sources=sources,
        selection=list(selection) if isinstance(selection, list) else selection,
    )
