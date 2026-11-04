#!/bin/sh
# Downloads and checks the GGUF a Modelfile builds from, given by its "# Weights: <url> sha256:<hash>" line.
#   sh scripts/weights.sh Modelfile.lite
# The file lands at the Modelfile's FROM path (models/, not tracked by git). A file already there is only checked.
set -eu

die() { printf 'Fly: %s\n' "$*" >&2; exit 1; }
[ $# -eq 1 ] || die "usage: sh scripts/weights.sh <Modelfile>"
here=$(cd "$(dirname "$0")/.." && pwd)
modelfile=$here/$1
[ -f "$modelfile" ] || die "$1 not found."

weights=$(sed -n 's/^# Weights: //p' "$modelfile")
[ -n "$weights" ] || die "$1 has no '# Weights:' line."
url=${weights% sha256:*}
sum=${weights##*sha256:}
target=$here/$(sed -n 's/^FROM \.\///p' "$modelfile")
[ "$target" != "$here/" ] || die "$1 does not build from a local file."

if command -v sha256sum >/dev/null 2>&1; then hash() { sha256sum "$1" | cut -d' ' -f1; }
else hash() { shasum -a 256 "$1" | cut -d' ' -f1; }; fi

mkdir -p "$(dirname "$target")"
if [ ! -f "$target" ]; then
  printf '==> downloading %s\n' "$url"
  curl -fL --retry 3 -C - -o "$target.part" "$url" || die "download failed: $url"
  mv "$target.part" "$target"
fi
[ "$(hash "$target")" = "$sum" ] || { rm -f "$target"; die "checksum mismatch for $target, file removed: run again."; }
printf '==> %s ok\n' "${target#"$here"/}"
