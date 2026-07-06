#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v pipx >/dev/null 2>&1; then
  echo "pipx is required (https://pipx.pypa.io/). Install it, then re-run this script." >&2
  exit 1
fi

echo "Installing the dbt-debug CLI..."
pipx install "$REPO/backend" --force >/dev/null
echo "  ✓ dbt-debug installed ($(command -v dbt-debug))"
echo

echo "Where should the Claude Code skill go?"
echo "  [g] Global   — ~/.claude/skills           (available in every project)"
echo "  [p] Project  — <a project>/.claude/skills (one project only)"
read -r -p "Choose [g/p]: " choice

case "${choice:-}" in
  g|G)
    dest="$HOME/.claude/skills/dbt-debugger"
    ;;
  p|P)
    read -r -p "Project directory [.]: " proj
    proj="${proj:-.}"
    if [ ! -d "$proj" ]; then
      echo "No such directory: $proj" >&2
      exit 1
    fi
    dest="$(cd "$proj" && pwd)/.claude/skills/dbt-debugger"
    ;;
  *)
    echo "Cancelled — CLI installed, skill not copied." >&2
    exit 1
    ;;
esac

mkdir -p "$dest"
cp "$REPO/.claude/skills/dbt-debugger/SKILL.md" "$dest/SKILL.md"
echo "  ✓ skill installed to $dest"
echo
echo "Done. Point dbt-debug at a target/ dir, or ask Claude to debug a failed dbt run."
