#!/usr/bin/env bash
# Regenerate the interactive maps that the demo site links to.
# Run from anywhere; paths are resolved relative to the repo root.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
fx="$root/fixtures"

render() {
  local name="$1" dir="$2" analysis="${3:-}"
  local args=(--manifest "$fx/$dir/manifest.json" --run-results "$fx/$dir/run_results.json")
  [ -f "$fx/$dir/sources.json" ] && args+=(--sources "$fx/$dir/sources.json")
  [ -n "$analysis" ] && args+=(--analysis "$analysis")
  dbt-debug "${args[@]}" --no-open --out "$here/$name.html"
  echo "  built $name.html from fixtures/$dir"
}

echo "Rendering demo maps into docs/ ..."
render demo jaffle_shop_demo "$here/analysis/demo.json"
render run  jaffle_shop_run
render test jaffle_shop_test
echo "Done. Open docs/index.html to view the site."
