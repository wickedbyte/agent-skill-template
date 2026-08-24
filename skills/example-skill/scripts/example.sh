#!/usr/bin/env bash
# Template note: skills can bundle executable helpers that agents run instead
# of re-deriving logic each time. Scripts should be self-contained, print
# helpful errors, and document their dependencies at the top of the file.
#
# Dependencies: bash (no others)
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") --input <file>" >&2
  exit 2
}

input=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      [[ $# -ge 2 ]] || usage
      input="$2"
      shift 2
      ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done

[[ -n "$input" ]] || usage
[[ -f "$input" ]] || {
  echo "error: input file not found: $input" >&2
  exit 1
}

echo "example-skill: processed $input"
