#!/bin/sh
# Publishes the Fly 1.0 range on ollama.com: <user>/fly1.0:ultra (Le Chonk, cloud) and <user>/fly1.0:lite (local).
#   sh scripts/publish.sh [<ollama.com username>] [<name> ...]
# Default user: Tromset. Default names: every model below. Example: sh scripts/publish.sh Tromset fly1.0:lite
# Prerequisite: this machine's Ollama key is linked to the account (`ollama signin` once).
# fly1.0:ultra is built on a cloud model: the signed-in key is also what lets Ollama reach it.
#   FLY_PRUNE=1  removes each model and its base after the push, to keep the disk free
set -eu

VERSION=1.0
# Modelfile, published name. Keep in sync with docs/ollama/ and README.md.
MODELS='Modelfile.ultra fly1.0:ultra
Modelfile.lite fly1.0:lite'

die() { printf 'Fly: %s\n' "$*" >&2; exit 1; }

user=${1:-Tromset}
[ "${user#-}" = "$user" ] || die "usage: sh scripts/publish.sh [<ollama.com username>] [<name> ...]"
[ $# -gt 0 ] && shift
command -v ollama >/dev/null 2>&1 || die "Ollama is not installed."
ollama list >/dev/null 2>&1 || die "Ollama is not responding. Start it with 'ollama serve'."

here=$(cd "$(dirname "$0")/.." && pwd)
wanted() { # wanted <name> [<requested name> ...]: true when nothing was requested or <name> was
  n=$1; shift
  [ $# -eq 0 ] && return 0
  for w in "$@"; do [ "$w" = "$n" ] && return 0; done
  return 1
}

echo "$MODELS" | while read -r file name; do
  wanted "$name" "$@" || continue
  base=$(sed -n 's/^FROM //p' "$here/$file" | head -n 1)
  [ -n "$base" ] || die "$file has no FROM line."
  printf '\n==> %s/%s (%s, base %s)\n' "$user" "$name" "$file" "$base"
  ollama pull "$base"
  ollama create "$user/$name" -f "$here/$file"
  ollama push "$user/$name"
  if [ "${FLY_PRUNE:-0}" = 1 ]; then ollama rm "$user/$name" "$base" >/dev/null; fi
done

printf '\nPublished Fly %s. Anyone can now run:\n' "$VERSION"
printf '  ollama run %s/fly1.0:ultra    (Le Chonk in the cloud, after ollama signin)\n' "$user"
printf '  ollama run %s/fly1.0:lite     (local, Macs with 8 GB or more)\n' "$user"
