from __future__ import annotations

import json
from pathlib import Path

_SHELL = (Path(__file__).parent / "web" / "index.html").read_text()


def render_html(graph: dict) -> str:
    payload = json.dumps(graph).replace("</", "<\\/")
    return _SHELL.replace("__GRAPH_JSON__", payload)
