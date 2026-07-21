---
name: nevo-verify-change
description: Select and run verification checks for Nevo from the current Git diff. Use after implementing, fixing, or refactoring project files; before reporting completion; when deciding which frontend, editor-core, localization, UI, Tauri, Rust, build, or full-suite checks are required; or when the repository has unrelated baseline failures and changed-file checks are needed.
---

# Verify a Nevo Change

Derive a reproducible check plan from changed paths, run the applicable checks, and report results without hiding baseline failures.

## Workflow

1. Read the root `AGENTS.md` and every nested `AGENTS.md` that applies to changed files.
2. Review `git status --short` and the scoped diff. Treat unrelated changes as user-owned.
3. Preview the deterministic check plan:

   ```bash
   .codex/skills/nevo-verify-change/scripts/verify_change.sh
   ```

4. Confirm the selected checks cover the behavior changed. Add a focused regression test command manually when path matching cannot infer the exact test.
5. Run the plan:

   ```bash
   .codex/skills/nevo-verify-change/scripts/verify_change.sh --run
   ```

6. For cross-cutting or release-sensitive work, request the full gate:

   ```bash
   .codex/skills/nevo-verify-change/scripts/verify_change.sh --run --full
   ```

7. Review `git diff --check` and the final diff after tests. Update `changes.md` only after successful implementation verification.
8. Report each check as passed, failed, or skipped. Identify failures that predate the scoped change; never claim success for a command that was not run.

## Diff Selection

- By default, inspect staged, unstaged, and untracked non-ignored files.
- Use `--base <git-ref>` to include committed changes since a branch or revision, for example `--base origin/main`.
- Use `--full` to select full frontend gates and Rust gates even when path inference would choose a smaller set.

## Baseline Failures

Do not repair unrelated lint or test failures unless the user expands the scope. When a full-tree command fails:

1. Run the closest changed-file or focused-test equivalent.
2. Compare failures with changed paths and the pre-existing state when evidence is available.
3. State the full-tree failure and the focused result separately.

The script is a selector, not proof of semantic coverage. Always add domain-specific tests required by nested `AGENTS.md` files.
