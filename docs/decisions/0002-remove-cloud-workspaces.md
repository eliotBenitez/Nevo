# 0002 — Cloud workspaces, shared storages, teams and OAuth removed

**Status:** Accepted, September 2026. Follows from [0001](0001-note-json-single-source-of-truth.md).

## Context

Nevo shipped a second workspace kind alongside local folders: a cloud-backed "shared storage" with team membership, roles, invitations, encryption-key management, and OAuth sign-in against a relay service.

It never reached the quality of the local path, and it contradicted the product's stated promise — everything you create stays on your own device. Concretely:

- **Every feature had to be written twice**, or gated. A cloud workspace has no filesystem path, so anything built on one (the MCP bridge, Arch/Android packaging paths, asset import, snapshots) needed a second implementation or an explicit refusal.
- **It carried the collaboration stack.** With [0001](0001-note-json-single-source-of-truth.md) removing the CRDT, the remaining cloud surface had no synchronization story left.
- **It widened the security surface out of proportion to use** — OAuth tokens, key custody, and a network service, for a feature path few users took.

## Decision

Local workspaces are the only kind. Cloud workspaces, shared storages, team/member management, invitations, and OAuth authentication are removed from the application.

The relay service remains deployed as infrastructure, but the application no longer talks to it, and no code path in this repository should.

## Consequences

- There is exactly one workspace kind. New features do not need a cloud branch, and a `WorkspaceView` or command no longer has to ask whether a filesystem path exists.
- Users who kept notes only in a cloud workspace are not served by this repository. That migration was a one-time concern, not an ongoing contract.
- Sharing is now the user's own business — their filesystem, their sync tool, their version control. Features that assume otherwise are out of scope.
- Anything needing multi-device access should be designed against the local directory, not against a service.

## Residue

Legitimate, do not remove:

- `src/app/legacyCloudCleanup.ts` — a one-time, best-effort cleanup of leftover local cloud state, invoked fire-and-forget from `src/main.ts` so it can never race the app mount. Needed for as long as machines carry state written by pre-removal builds.

Anything else referencing cloud workspaces, relays, team roles, invitations, or OAuth is stale and should be deleted rather than restored.
