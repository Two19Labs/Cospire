#!/usr/bin/env bash
set -euo pipefail

name="${1:-}"

if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: scripts/wt-done.sh <lowercase-name>" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
repo_parent="$(dirname "$repo_root")"
target="$repo_parent/Cospire-$name"
branch="feat/$name"

if [[ ! -d "$target" ]]; then
  echo "Worktree path does not exist: $target" >&2
  exit 1
fi

# Ask Git for both absolute paths so Windows drive-letter paths and Git Bash
# /c/... paths cannot produce a false mismatch.
resolved_target="$(git -C "$target" rev-parse --show-toplevel)"
expected_prefix="$repo_parent/Cospire-"

if [[ "$resolved_target" != "$expected_prefix"* ]]; then
  echo "Refusing to remove unexpected path: $resolved_target" >&2
  exit 1
fi

if ! git worktree list --porcelain | grep -Fqx "worktree $resolved_target"; then
  echo "Worktree is not registered: $resolved_target" >&2
  exit 1
fi

git fetch origin main
if ! git merge-base --is-ancestor "$branch" origin/main; then
  echo "$branch is not merged into origin/main; refusing removal." >&2
  exit 1
fi

git worktree remove "$resolved_target"
git branch -d "$branch"

echo "Removed merged worktree $resolved_target and branch $branch."
