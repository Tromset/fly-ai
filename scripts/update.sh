#!/bin/sh
# Updates Fly: this clone (FlyBrain, Modelfiles) and the Fly models already installed in Ollama.
#   npm run update        (or: sh scripts/update.sh)
# 1. the code: a fast-forward `git pull` in this clone, which never merges or overwrites local changes;
# 2. the models: `ollama pull` for every published Fly model in `ollama list` (Tromset/fly1.1:lite, ...).
# A model you do not have is not installed. Fly has no dependencies, so there is nothing else to reinstall.
set -eu

say() { printf '%s\n' "$@"; }
die() { printf 'Fly: %s\n' "$*" >&2; exit 1; }

here=$(cd "$(dirname "$0")/.." && pwd)

if [ -d "$here/.git" ] && command -v git >/dev/null 2>&1; then
  before=$(git -C "$here" rev-parse --short HEAD)
  say "==> Updating the code in $here"
  git -C "$here" pull --ff-only || die "git could not fast-forward, nothing was changed. Check the clone with: git -C \"$here\" status"
  after=$(git -C "$here" rev-parse --short HEAD)
  if [ "$before" = "$after" ]; then say "Code already up to date ($after)."
  else say "Code updated: $before -> $after. Restart FlyBrain if it is running."; fi
else
  say "==> $here is not a git clone: only the models are updated."
fi

command -v ollama >/dev/null 2>&1 || die "Ollama is not installed, so the models were not updated. Download it from https://ollama.com/download"
list=$(ollama list 2>/dev/null) || die "Ollama is not responding, so the models were not updated. Open the Ollama app (or run 'ollama serve'), then try again."

# Published Fly models only: a namespace, then fly and a version (Tromset/fly1.0:ultra). Not flycoder or flymotion.
models=$(printf '%s\n' "$list" | awk 'NR > 1 && $1 ~ /^[^\/]+\/fly[0-9]/ { print $1 }')
if [ -z "$models" ]; then
  say "No published Fly model is installed. Get one with: ollama pull Tromset/fly1.1:lite"
  exit 0
fi
for model in $models; do
  say "==> Updating the model $model"
  ollama pull "$model" || die "$model could not be pulled. Run: ollama pull $model"
done
say "" "Fly is up to date."
