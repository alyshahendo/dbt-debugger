from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol


@dataclass
class RawArtifacts:
    manifest: dict
    run_results: dict
    sources_results: Optional[dict] = None


class ArtifactSource(Protocol):
    def resolve(self) -> RawArtifacts: ...


def _load(path: Path, *, required: bool) -> Optional[dict]:
    if not path.is_file():
        if required:
            raise FileNotFoundError(f"expected dbt artifact not found: {path}")
        return None
    return json.loads(path.read_text())


@dataclass
class LocalTargetSource:
    target_dir: str | Path

    def resolve(self) -> RawArtifacts:
        target = Path(self.target_dir)
        return RawArtifacts(
            manifest=_load(target / "manifest.json", required=True),
            run_results=_load(target / "run_results.json", required=True),
            sources_results=_load(target / "sources.json", required=False),
        )


@dataclass
class DirectFilesSource:
    manifest_path: str | Path
    run_results_path: str | Path
    sources_path: Optional[str | Path] = None

    def resolve(self) -> RawArtifacts:
        return RawArtifacts(
            manifest=_load(Path(self.manifest_path), required=True),
            run_results=_load(Path(self.run_results_path), required=True),
            sources_results=(
                _load(Path(self.sources_path), required=False)
                if self.sources_path
                else None
            ),
        )


@dataclass
class DbtCloudSource:
    """Stub. Open before building: run-selection (explicit run id vs latest
    failed run of a job) and credential handling."""

    account_id: str
    run_id: Optional[str] = None
    job_id: Optional[str] = None
    token: Optional[str] = None

    def resolve(self) -> RawArtifacts:
        raise NotImplementedError(
            "dbt Cloud resolver is not implemented yet — use local or direct sources."
        )


def resolve_source(
    *,
    target: Optional[str] = None,
    manifest: Optional[str] = None,
    run_results: Optional[str] = None,
    sources: Optional[str] = None,
) -> ArtifactSource:
    if manifest and run_results:
        return DirectFilesSource(manifest, run_results, sources)
    if target:
        return LocalTargetSource(target)
    cwd_target = Path.cwd() / "target"
    if (cwd_target / "manifest.json").is_file():
        return LocalTargetSource(cwd_target)
    raise ValueError(
        "no artifacts found — pass --target <dir> or --manifest/--run-results paths"
    )
