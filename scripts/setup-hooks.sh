#!/usr/bin/env bash
# Points git at the tracked hooks in scripts/hooks. Run once after cloning.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
chmod +x scripts/hooks/*
git config core.hooksPath scripts/hooks
echo "Git hooks installed (core.hooksPath = scripts/hooks)."
