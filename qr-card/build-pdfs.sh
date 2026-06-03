#!/usr/bin/env bash
# Build all three Niv punch-card QR PDF variants from qr-code-print.html.
# The HTML reads ?theme=… from the URL and switches the colour scheme;
# this script just calls Chrome headless once per variant.

set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="file://${DIR}/qr-code-print.html"

build() {
  local theme="$1" outfile="$2"
  local url="${SRC}"
  [[ "$theme" != "default" ]] && url="${SRC}?theme=${theme}"
  "${CHROME}" \
    --headless=new --disable-gpu --no-pdf-header-footer \
    --virtual-time-budget=8000 --run-all-compositor-stages-before-draw \
    --print-to-pdf="${DIR}/${outfile}" \
    "${url}" 2>/dev/null
  printf "  %-36s  %s\n" "${outfile}" "$(stat -f%z "${DIR}/${outfile}") bytes"
}

echo "Building punch-card PDFs in ${DIR}:"
build default    niv-punch-qr.pdf
build cream-card niv-punch-qr-cream-card.pdf
build cream-bg   niv-punch-qr-cream-bg.pdf
echo "Done."
