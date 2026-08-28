#!/usr/bin/env bash
set -euo pipefail

name="${1:-}"
port="${2:-}"

if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: scripts/wt-new.sh <lowercase-name> <port>" >&2
  exit 1
fi

if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
  echo "Port must be an integer between 1024 and 65535." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
repo_parent="$(dirname "$repo_root")"
target="$repo_parent/Cospire-$name"
branch="feat/$name"

if [[ -e "$target" ]]; then
  echo "Refusing to overwrite existing path: $target" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch already exists: $branch" >&2
  exit 1
fi

git fetch origin main
git worktree add "$target" -b "$branch" origin/main

if [[ -f "$repo_root/.env.local" ]]; then
  cp "$repo_root/.env.local" "$target/.env.local"
else
  cp "$repo_root/.env.example" "$target/.env.local"
fi

printf '\nPORT=%s\n' "$port" >> "$target/.env.local"
npm --prefix "$target" ci

echo "Created $target on $branch (port $port)."
