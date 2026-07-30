#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Design Audit — AI Slop Detection
# Scans source files for common pattern-reflex tells that make AI-generated
# UIs feel generic.  Exit code is the number of hits found (0 = clean).
#
# Usage:  bash scripts/design-audit.sh [--gh-annotation]
#
# When --gh-annotation is passed, patterns are also printed as GitHub
# workflow-command annotations so they surface inline in PRs.
# ---------------------------------------------------------------------------
set -euo pipefail

REPORT_FILE=".github/design-audit-report.md"
HITS=0

# Directories to scan (TSX, TS, CSS)
SCAN_DIRS="app components lib dictionaries"
FILE_PATTERN="*.tsx *.ts *.css"

# ── helpers ────────────────────────────────────────────────────────────────
warn() {
  local severity="$1"  # notice / warning / error
  local title="$2"
  local msg="$3"
  if [[ "${GH_ANNOTATION:-}" == "true" ]]; then
    echo "::$severity title=$title::$msg"
  fi
  printf "  [%-7s] %s  %s\n" "$severity" "$title" "$msg"
}

count() {
  (( HITS++ )) || true
}

# ── 1. Side-stripe borders ────────────────────────────────────────────────
scan_side_stripes() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rn 'border-left\|border-right' "$SCAN_DIRS" \
    --include="*.tsx" --include="*.css" \
    | grep -vi 'node_modules' \
    | grep -iP '(border-left|border-right)\s*:\s*\d+px\s+(solid|dashed|dotted)' \
    || true)

  if (( total > 0 )); then
    warn "warning" "side-stripe-borders" \
      "Found $total side-stripe border(s) (>1px colored left/right). Prefer full borders, bg tints, or leading icons."
  fi
}

# ── 2. Gradient text (background-clip: text + gradient) ───────────────────
scan_gradient_text() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rn 'background-clip.*text\|bg-clip-text' "$SCAN_DIRS" \
    --include="*.tsx" --include="*.ts" --include="*.css" \
    | grep -vi 'node_modules' \
    | grep -iP '(linear-gradient|radial-gradient|conic-gradient)' \
    || true)

  if (( total > 0 )); then
    warn "warning" "gradient-text" \
      "Found $total gradient-text usage(s). Gradient text is decorative and rarely meaningful. Use solid colour + weight/size for emphasis."
  fi
}

# ── 3. Glassmorphism (decorative backdrop-filter blur) ────────────────────
scan_glassmorphism() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rn 'backdrop-filter.*blur\|backdrop-blur' "$SCAN_DIRS" \
    --include="*.tsx" --include="*.ts" --include="*.css" \
    | grep -vi 'node_modules' \
    | grep -viP '(dialog|modal|popover|toast|sheet)' \
    || true)

  if (( total > 0 )); then
    warn "notice" "glassmorphism" \
      "Found $total backdrop-blur usage(s) outside dialogs/modals. Glassmorphism should be rare and purposeful."
  fi
}

# ── 4. Tiny uppercase tracked eyebrows ────────────────────────────────────
scan_eyebrows() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rn 'tracking-wider\|tracking-wide\|uppercase' "$SCAN_DIRS" \
    --include="*.tsx" --include="*.ts" --include="*.css" \
    | grep -vi 'node_modules' \
    | grep -viP '(button|badge|tab|label|chip|tag)' \
    || true)

  if (( total > 0 )); then
    warn "notice" "eyebrow-headings" \
      "Found $total uppercase/tracking usage(s) outside buttons/badges. Eyebrow kickers above every section are an AI tell."
  fi
}

# ── 5. Numbered section markers (01 / 02 / 03) ────────────────────────────
scan_numbered_sections() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rnP '0\d\s*(·|\.|–|—)\s*' "$SCAN_DIRS" \
    --include="*.tsx" --include="*.ts" \
    | grep -vi 'node_modules' \
    | grep -iP '(about|process|pricing|features|services|steps)' \
    || true)

  if (( total > 0 )); then
    warn "notice" "numbered-sections" \
      "Found $total numbered section marker(s) (01 · About / 02 · Process patterns). Numbers earn their place only when order carries meaning."
  fi
}

# ── 6. Hero metric template (big number + small label) ────────────────────
scan_hero_metrics() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rnP 'text-\d+xl.*\d+' "$SCAN_DIRS" \
    --include="*.tsx" \
    | grep -vi 'node_modules' \
    | grep -iP '(users|customers|stars|downloads|tasks|projects?)' \
    || true)

  if (( total > 0 )); then
    warn "notice" "hero-metrics" \
      "Found $total hero-metric pattern(s). Big number + small label is a SaaS cliché."
  fi
}

# ── 7. Overly-nested Card grids ──────────────────────────────────────────
scan_nested_cards() {
  local total=0
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rnP '<Card[^>]*>.*<Card[^>]*>' "$SCAN_DIRS" \
    --include="*.tsx" \
    | grep -vi 'node_modules' \
    || true)

  if (( total > 0 )); then
    warn "notice" "nested-cards" \
      "Found $total nested-Card pattern(s). Nested cards are always wrong per impeccable guidelines."
  fi
}

# ── 8. Cream / sand / beige body backgrounds ──────────────────────────────
scan_cream_bg() {
  local total=0
  # Check for warm-tinted near-white backgrounds in the design token range
  while IFS= read -r line; do
    count
    (( total++ )) || true
  done < <(grep -rnP 'oklch\(.*(8\d|9\d)\s+(0\.0[0-5]|0\.0[6-9])\s+(4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)' "$SCAN_DIRS" \
    --include="*.css" \
    | grep -vi 'node_modules' \
    || true)

  if (( total > 0 )); then
    warn "warning" "cream-bg" \
      "Found $total warm-tinted near-white background(s) (oklch L>80, C>0.06, hue 40-100). Cream/sand body bg is the saturated AI default."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  if [[ "${1:-}" == "--gh-annotation" ]]; then
    export GH_ANNOTATION="true"
  fi

  echo "┌─────────────────────────────────────────────┐"
  echo "│  Design Audit — AI Slop Detection           │"
  echo "└─────────────────────────────────────────────┘"
  echo ""

  scan_side_stripes
  scan_gradient_text
  scan_glassmorphism
  scan_eyebrows
  scan_numbered_sections
  scan_hero_metrics
  scan_nested_cards
  scan_cream_bg

  echo ""
  echo "───────────────────────────────────────────────"
  if (( HITS == 0 )); then
    echo "  ✅  Clean — no AI Slop patterns detected."
  else
    echo "  ⚠️   Found $HITS potential AI Slop pattern(s). Review warnings above."
  fi
  echo "───────────────────────────────────────────────"

  # Write report file (only on PR events)
  if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
  cat > "$REPORT_FILE" <<-REPORT
## 🎨 Design Audit Report

**AI Slop patterns detected: $HITS**

| Pattern | Count | Severity |
|---------|-------|----------|
| Side-stripe borders | $(grep -rn 'border-left\|border-right' $SCAN_DIRS --include="*.tsx" --include="*.css" | grep -vi node_modules | grep -iP '(border-left|border-right)\s*:\s*\d+px\s+(solid|dashed|dotted)' 2>/dev/null | wc -l) | warning |
| Gradient text | $(grep -rn 'background-clip.*text\|bg-clip-text' $SCAN_DIRS --include="*.tsx" --include="*.ts" --include="*.css" | grep -vi node_modules | grep -iP '(linear-gradient|radial-gradient|conic-gradient)' 2>/dev/null | wc -l) | warning |
| Glassmorphism (outside modals) | $(grep -rn 'backdrop-filter.*blur\|backdrop-blur' $SCAN_DIRS --include="*.tsx" --include="*.ts" --include="*.css" | grep -vi node_modules | grep -viP '(dialog|modal|popover|toast|sheet)' 2>/dev/null | wc -l) | notice |
| Eyebrow headings | $(grep -rn 'tracking-wider\|tracking-wide\|uppercase' $SCAN_DIRS --include="*.tsx" --include="*.ts" --include="*.css" | grep -vi node_modules | grep -viP '(button|badge|tab|label|chip|tag)' 2>/dev/null | wc -l) | notice |
| Numbered sections (01 / 02) | $(grep -rnP '0\d\s*(·|\.|–|—)\s*' $SCAN_DIRS --include="*.tsx" --include="*.ts" | grep -vi node_modules | grep -iP '(about|process|pricing|features|services|steps)' 2>/dev/null | wc -l) | notice |
| Hero metrics | $(grep -rnP 'text-\d+xl.*\d+' $SCAN_DIRS --include="*.tsx" | grep -vi node_modules | grep -iP '(users|customers|stars|downloads|tasks|projects?)' 2>/dev/null | wc -l) | notice |
| Nested cards | $(grep -rn 'Card.*Card\|card.*card' $SCAN_DIRS --include="*.tsx" | grep -vi node_modules 2>/dev/null | wc -l) | notice |
| Cream/sand backgrounds | $(grep -rnP 'oklch\(.*(8\d|9\d)\s+(0\.0[0-5]|0\.0[6-9])\s+(4[0-9]|5[0-9]|6[0-9]|7[4-9]|8[0-9]|9[0-9]|100)' $SCAN_DIRS --include="*.css" | grep -vi node_modules 2>/dev/null | wc -l) | warning |

> _Last updated: $(date -u '+%Y-%m-%d %H:%M UTC')_
REPORT
  fi

  exit "$HITS"
}

main "$@"
