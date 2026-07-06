"""Root-cause vs. casualty classification.

Leans on dbt's own execution semantics:
  - status=error  => the node actually ran (its parents succeeded) => ROOT CAUSE
  - status=skipped => dbt blocked it because an upstream node failed => CASUALTY
  - in `dbt build`, a FAILED TEST gates downstream models (they get skipped);
    the test's attached model is treated as the blocking root cause.
  - an EPHEMERAL model never runs on its own; dbt inlines it as a CTE into its
    consumers. If it is inlined into a model that errored, its SQL is a hidden
    candidate for the bug, so it is flagged a SUSPECT rather than shown as ok.

Each casualty is attributed to its NEAREST failed/blocking ancestor via an
upward (reverse) breadth-first walk over the model DAG.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import networkx as nx

from .parser import ParsedArtifacts


@dataclass
class Classification:
    failure_class: str
    blamed_root_cause_unique_id: Optional[str]


def build_dag(artifacts: ParsedArtifacts) -> nx.DiGraph:
    g = nx.DiGraph()
    g.add_nodes_from(artifacts.models)
    for uid, model in artifacts.models.items():
        for parent in model.depends_on:
            if parent in artifacts.models:
                g.add_edge(parent, uid)
    return g


def _nearest_root_ancestor(
    g: nx.DiGraph, node: str, roots: set[str]
) -> Optional[str]:
    seen = {node}
    frontier = [p for p in g.predecessors(node)]
    while frontier:
        next_frontier: list[str] = []
        for p in frontier:
            if p in seen:
                continue
            seen.add(p)
            if p in roots:
                return p
            next_frontier.extend(g.predecessors(p))
        frontier = next_frontier
    return None


def _ephemeral_error_consumer(
    g: nx.DiGraph, node: str, ephemeral: set[str], failed: set[str]
) -> Optional[str]:
    """An ephemeral model is inlined into whatever refs it (recursively through
    other ephemeral models). Return an errored model it is inlined into, if any."""
    seen = {node}
    frontier = list(g.successors(node))
    while frontier:
        next_frontier: list[str] = []
        for s in frontier:
            if s in seen:
                continue
            seen.add(s)
            if s in failed:
                return s
            if s in ephemeral:
                next_frontier.extend(g.successors(s))
        frontier = next_frontier
    return None


def classify(artifacts: ParsedArtifacts) -> dict[str, Classification]:
    g = build_dag(artifacts)
    status_of = {
        uid: artifacts.results[uid].status
        for uid in artifacts.models
        if uid in artifacts.results
    }
    is_build = artifacts.command == "build"

    failed = {uid for uid in artifacts.models if status_of.get(uid) == "error"}
    ephemeral = {
        uid
        for uid, m in artifacts.models.items()
        if (m.materialization or "").lower() == "ephemeral"
    }

    blocking: set[str] = set()
    if is_build:
        for tuid, test in artifacts.tests.items():
            res = artifacts.results.get(tuid)
            if res and res.status in ("fail", "error"):
                if test.attached_model_unique_id in artifacts.models:
                    blocking.add(test.attached_model_unique_id)

    roots = failed | blocking

    result: dict[str, Classification] = {}
    for uid in artifacts.models:
        status = status_of.get(uid)
        if uid in roots:
            result[uid] = Classification("root_cause", uid)
        elif uid in ephemeral and uid not in artifacts.results:
            consumer = _ephemeral_error_consumer(g, uid, ephemeral, failed)
            if consumer is not None:
                result[uid] = Classification("suspect", consumer)
            else:
                result[uid] = Classification("ok", None)
        elif status == "skipped":
            blame = _nearest_root_ancestor(g, uid, roots)
            if blame is not None:
                result[uid] = Classification("casualty", blame)
            else:
                result[uid] = Classification("skipped", None)
        else:
            result[uid] = Classification("ok", None)
    return result
