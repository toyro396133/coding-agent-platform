#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# validate-docs.sh — pre-commit hook that validates:
#   1. Mermaid diagram syntax inside ```mermaid blocks in .md files
#   2. Internal file links in .md files (anchors excluded)
#   3. Cross-reference links between documents
#
# Usage: ./scripts/validate-docs.sh [--fix] [--verbose]
#   --fix      Attempt to fix trivial issues (broken links → warn instead of fail)
#   --verbose  Print per-file summary even when passing
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

VERBOSE=false
FIX=false
HAS_ERROR=false

for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=true ;;
    --fix)     FIX=true ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[docs]${NC} $1"; }
pass()    { echo -e "${GREEN}  ✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
fail()    { echo -e "${RED}  ❌ $1${NC}"; HAS_ERROR=true; }
verbose() { $VERBOSE && echo -e "  ${BOLD}$1${NC}"; }

cleanup() {
  rm -f "$AWK_OUT" 2>/dev/null || true
}
AWK_OUT=""
trap cleanup EXIT

# === Gather markdown files =================================================
MD_FILES=$(find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' | sort)

file_count=$(echo "$MD_FILES" | wc -l | tr -d ' ')
info "Found $file_count markdown files to check"

# ===========================================================================
# CHECK 1: Mermaid diagram validation
# ===========================================================================
info "Checking Mermaid diagram syntax..."

MERMAID_FILES=$(echo "$MD_FILES" | xargs grep -l '```mermaid' 2>/dev/null || true)

if [ -z "$MERMAID_FILES" ]; then
  verbose "No Mermaid diagrams found — skipping Mermaid check"
else
  DIAGRAM_COUNT=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    # Extract all mermaid blocks from this file using awk.
    # Uses ^```$ (exact match) for the closing fence so it doesn't
    # false-match on ^```mermaid opening lines.
    blocks=$(awk '
      /^```mermaid/ { in_block = 1; block = $0 "\n"; next }
      /^```$/ && in_block { in_block = 0; print block; block = ""; next }
      in_block { block = block $0 "\n" }
    ' "$file" 2>/dev/null || true)

    block_count=$(echo "$blocks" | grep -c '^```mermaid' 2>/dev/null || echo 0)

    if [ "$block_count" -eq 0 ]; then
      # Fallback: sed range extraction
      blocks=$(sed -n '/^```mermaid/,/^```$/p' "$file" 2>/dev/null || true)
      block_count=$(echo "$blocks" | grep -c '^```mermaid' 2>/dev/null || echo 0)
    fi

    DIAGRAM_COUNT=$((DIAGRAM_COUNT + block_count))

    # Verbose: show block contents (subshell safe — no variable mutations)
    if $VERBOSE; then
      echo "$blocks" | while IFS= read -r bl; do
        if echo "$bl" | grep -q '^```mermaid'; then
          verbose "--- Block start ---"
          continue
        fi
        if echo "$bl" | grep -q '^```$'; then
          verbose "--- Block end ---"
          continue
        fi
        verbose "  $bl"
      done
    fi

    # Validate structure using awk.
    #
    # TIP: erDiagram syntax uses asymmetric braces for relationship
    # cardinality notation (||--o{, }o--||). We detect erDiagram blocks
    # by looking for the "erDiagram" keyword and skip brace counting
    # for those blocks entirely.
    AWK_OUT=$(mktemp)
    awk '
      BEGIN {
        err = 0
        msg = ""
        in_block = 0
        is_er = 0      # flag: current block is an erDiagram
        braces = 0
        subgraphs = 0
      }

      /^```mermaid/ { in_block = 1; is_er = 0; next }
      /^```$/ && in_block { in_block = 0; is_er = 0 }
      !in_block { next }

      {
        # Detect erDiagram blocks — the very first keyword
        if ($1 == "erDiagram") { is_er = 1 }

        line = $0

        # Count braces — skip for erDiagram blocks where
        # { and } are asymmetric cardinality sigils
        if (!is_er) {
          n = length(line)
          for (i = 1; i <= n; i++) {
            c = substr(line, i, 1)
            if (c == "{") braces++
            if (c == "}") braces--
          }
        }

        # Count subgraph / end keywords
        if (line ~ /^subgraph[ \t]/) subgraphs++
        if (line ~ /^end($|[ \t])/) subgraphs--

        # Dangling connections (line ends with arrow tail)
        if (line ~ /-->$/ || line ~ /-->>$/ || line ~ /-\.->$/) {
          msg = msg "Dangling connection at \"" substr(line, 1, 40) "...\"\\n"
          err++
        }

        # Malformed node IDs (|--| pattern inside text)
        if (line ~ /\|---\|/) {
          msg = msg "Likely malformed node ID: \"" line "\"\\n"
          err++
        }
      }

      END {
        if (braces != 0) {
          msg = msg "Unbalanced braces (open: " braces ")\\n"
          err++
        }
        if (subgraphs != 0) {
          msg = msg "Unclosed subgraph blocks (subgraphs - end = " subgraphs ")\\n"
          err++
        }
        print "MERMAID_ERR=" err
        gsub(/\\n/, "<nl>", msg)
        print "MERMAID_MSG=" msg
      }
    ' "$file" > "$AWK_OUT" 2>/dev/null || true

    # Read results safely from temp file
    MERMAID_ERR=0
    MERMAID_MSG=""
    if [ -f "$AWK_OUT" ]; then
      while IFS= read -r line; do
        case "$line" in
          MERMAID_ERR=*) MERMAID_ERR="${line#MERMAID_ERR=}" ;;
          MERMAID_MSG=*) MERMAID_MSG="${line#MERMAID_MSG=}" ;;
        esac
      done < "$AWK_OUT"
    fi
    rm -f "$AWK_OUT"
    AWK_OUT=""

    # Replace <nl> placeholders with actual newlines
    MERMAID_MSG="${MERMAID_MSG//<nl>/$'\n'}"

    if [ "${MERMAID_ERR:-0}" -gt 0 ]; then
      fail "Mermaid syntax error in $(basename "$file"): ${MERMAID_MSG:-Unknown issue}"
    else
      $VERBOSE && pass "$(basename "$file") — $block_count diagram(s)"
    fi
  done <<< "$MERMAID_FILES"

  if [ "$DIAGRAM_COUNT" -gt 0 ]; then
    mf_count=$(echo "$MERMAID_FILES" | wc -l | tr -d ' ')
    verbose "Total: $DIAGRAM_COUNT Mermaid diagram(s) across $mf_count file(s)"
  fi
fi

# ===========================================================================
# CHECK 2: Internal link validation
# ===========================================================================
info "Checking internal markdown links..."

link_errors=0
link_checked=0
link_valid=0

while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Extract [text](url) links (negative lookbehind excludes ![alt](url))
  links=$(grep -oP '(?<!!)\[([^\]]*)\]\(([^)]+)\)' "$file" 2>/dev/null || true)

  if [ -z "$links" ]; then
    $VERBOSE && verbose "  $(basename "$file") — no links"
    continue
  fi

  $VERBOSE && verbose "  $(basename "$file"):"

  # Here-string avoids subshell — variable mutations persist
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    link_checked=$((link_checked + 1))

    url=$(echo "$link" | sed -n 's/\[.*\](\(.*\))/\1/p' 2>/dev/null || echo "")

    # Skip external URLs, anchors-only, protocol links
    if echo "$url" | grep -qE '^(https?://|mailto:|#|ftp://)'; then
      link_valid=$((link_valid + 1))
      continue
    fi

    target_path=$(echo "$url" | sed 's/#.*//')
    [ -z "$target_path" ] && continue

    file_dir=$(dirname "$file")
    resolved="$file_dir/$target_path"
    resolved=$(echo "$resolved" | sed 's|/\./|/|g')

    if [ -f "$resolved" ]; then
      link_valid=$((link_valid + 1))
      $VERBOSE && pass "  $url → exists"
    else
      link_errors=$((link_errors + 1))
      if $FIX; then
        warn "Broken link in $(basename "$file"): '$url' (--fix mode, allowing)"
      else
        fail "Broken link in $(basename "$file"): '$url' → target not found"
        $VERBOSE && verbose "    resolved to: $resolved"
      fi
    fi
  done <<< "$links"
done <<< "$MD_FILES"

if [ "$link_errors" -eq 0 ]; then
  $VERBOSE && pass "All internal links are valid"
else
  if $FIX; then
    warn "$link_errors broken link(s) found (--fix mode, not failing)"
  else
    fail "$link_errors internal link(s) are broken"
  fi
fi

# ===========================================================================
# CHECK 3: Cross-document references
# ===========================================================================
info "Checking cross-document references..."

ref_errors=0

while IFS= read -r file; do
  [ -z "$file" ] && continue

  refs=$(grep -oP '\]\([A-Za-z0-9_./-]+\.md(#.*)?\)' "$file" 2>/dev/null || true)

  if [ -z "$refs" ]; then
    continue
  fi

  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    ref_target=$(echo "$ref" | sed 's/](/(/' | sed -n 's/.*(\(.*\))/\1/p' 2>/dev/null || echo "")
    ref_path=$(echo "$ref_target" | sed 's/#.*//')

    file_dir=$(dirname "$file")
    resolved="$file_dir/$ref_path"
    resolved=$(echo "$resolved" | sed 's|/\./|/|g')

    if [ -f "$resolved" ]; then
      $VERBOSE && verbose "  $ref_target ✓"
    else
      ref_errors=$((ref_errors + 1))
      if $FIX; then
        warn "Broken reference in $(basename "$file"): '$ref_target' (--fix mode, allowing)"
      else
        fail "Broken reference in $(basename "$file"): '$ref_target' → file not found"
      fi
    fi
  done <<< "$refs"
done <<< "$MD_FILES"

if [ "$ref_errors" -gt 0 ]; then
  if $FIX; then
    warn "$ref_errors cross-document reference(s) broken (--fix mode, not failing)"
  else
    fail "$ref_errors cross-document reference(s) broken"
  fi
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
if [ "$HAS_ERROR" = true ]; then
  echo -e "${RED}❌ Documentation validation failed.${NC}"
  echo -e "  ${YELLOW}Fix the issues above, then run:${NC}"
  echo -e "  ${CYAN}  ./scripts/validate-docs.sh --verbose${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Documentation validation passed.${NC}"
  exit 0
fi
