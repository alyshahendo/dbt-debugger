from __future__ import annotations

import json
from pathlib import Path

_TEMPLATES = Path(__file__).parent / "templates"
_PAGE = (_TEMPLATES / "page.html").read_text()
_STYLE = (_TEMPLATES / "style.css").read_text()
_APP_JS = "(function(){\n" + "\n".join(
    p.read_text() for p in sorted((_TEMPLATES / "js").glob("*.js"))
) + "\n})();\n"


def render_html(graph: dict) -> str:
    payload = json.dumps(graph).replace("</", "<\\/")
    return (
        _PAGE
        .replace("__STYLE__", _STYLE)
        .replace("__APP_JS__", _APP_JS)
        .replace("__GRAPH_JSON__", payload)
    )
