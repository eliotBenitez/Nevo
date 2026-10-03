#!/usr/bin/env bash
set -euo pipefail

run=false
full=false
base=''

usage() {
  echo 'Usage: verify_change.sh [--run] [--full] [--base <git-ref>]'
  echo '  default       print the inferred verification plan'
  echo '  --run         execute the inferred checks'
  echo '  --full        select full frontend and Rust gates'
  echo '  --base REF    include committed changes since REF'
}

while (($#)); do
  case "$1" in
    --run)
      run=true
      shift
      ;;
    --full)
      full=true
      shift
      ;;
    --base)
      if (($# < 2)); then
        echo 'ERROR: --base requires a git ref' >&2
        exit 2
      fi
      base=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

git rev-parse --show-toplevel >/dev/null

declare -A seen=()
paths=()

add_paths() {
  local path
  while IFS= read -r path; do
    [[ -z $path || -n ${seen[$path]:-} ]] && continue
    seen[$path]=1
    paths+=("$path")
  done
}

if [[ -n $base ]]; then
  git rev-parse --verify "$base^{commit}" >/dev/null
  add_paths < <(git diff --name-only "$base"...HEAD)
fi
add_paths < <(git diff --name-only)
add_paths < <(git diff --cached --name-only)
add_paths < <(git ls-files --others --exclude-standard)

if ((${#paths[@]} == 0)); then
  echo 'No changed files detected.'
  exit 0
fi

frontend=false
editor=false
locales=false
ui=false
tauri_frontend=false
rust=false
changed_lint_files=()

for path in "${paths[@]}"; do
  case "$path" in
    src/*.ts|src/*.vue|src/*.json|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|vite.config.*|eslint.config.*|tsconfig*.json)
      frontend=true
      ;;
  esac
  case "$path" in
    *.ts|*.vue)
      [[ -f $path ]] && changed_lint_files+=("$path")
      ;;
  esac
  case "$path" in
    src/editor-core/*.ts) editor=true ;;
    src/locales/*.json|src/locales/*.ts|src/i18n.ts|src/i18n.test.ts|src/types/workspace.ts) locales=true ;;
    src/ui/*.ts|src/ui/*.vue|src/styles/*.css) ui=true ;;
    src/tauri/*.ts) tauri_frontend=true ;;
    src-tauri/*.json|src-tauri/Cargo.toml|src-tauri/Cargo.lock|src-tauri/build.rs|src-tauri/capabilities/*.json|src-tauri/src/*.rs) rust=true ;;
  esac
done

if $full; then
  frontend=true
  rust=true
fi

echo "Changed files: ${#paths[@]}"
printf '  %s\n' "${paths[@]}"
echo
echo 'Verification plan:'
echo '  - git diff --check'

if $frontend; then
  if $full; then
    echo '  - pnpm lint'
    echo '  - pnpm test:run'
  elif ((${#changed_lint_files[@]})); then
    echo "  - pnpm exec eslint <${#changed_lint_files[@]} changed TS/Vue files>"
  fi
  $editor && echo '  - pnpm exec vitest run src/editor-core'
  $locales && echo '  - pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts'
  $ui && echo '  - pnpm exec vitest run src/ui'
  $tauri_frontend && echo '  - pnpm exec vitest run src/tauri'
  echo '  - pnpm build'
fi

if $rust; then
  echo '  - cargo fmt --manifest-path src-tauri/Cargo.toml --check'
  echo '  - cargo test --manifest-path src-tauri/Cargo.toml'
fi

echo '  - manual review of the scoped final diff'

if ! $run; then
  echo
  echo 'Plan only. Re-run with --run to execute it.'
  exit 0
fi

echo
echo 'Running verification...'
git diff --check

if $frontend; then
  if $full; then
    pnpm lint
    pnpm test:run
  elif ((${#changed_lint_files[@]})); then
    pnpm exec eslint "${changed_lint_files[@]}"
  fi
  $editor && pnpm exec vitest run src/editor-core
  $locales && pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts
  $ui && pnpm exec vitest run src/ui
  $tauri_frontend && pnpm exec vitest run src/tauri
  pnpm build
fi

if $rust; then
  cargo fmt --manifest-path src-tauri/Cargo.toml --check
  cargo test --manifest-path src-tauri/Cargo.toml
fi

echo 'Automated verification completed. Review the scoped final diff manually.'
