# Capability Adapters

Read only the section matching the current controlled capability.

## Console And System

Use the real console program as capability owner. Check exit status and stderr before rendering success. Preserve complete output when reasonably sized; otherwise label pagination, filtering, ranking, or head/tail adaptation. Process, service, package, permission, shutdown, disk, and deletion mutations retain required confirmation.

## Filesystem

A prompt that is exactly a plausible filesystem path, including `/`, may request a generated filesystem surface. Resolve and freshly inspect it before display.

1. Pin `⬆️ Up` first whenever the path is not root; its prompt is the exact parent path.
2. If paginated, place available `⬅️ Previous` and `➡️ Next` together after Up. Re-inspect on traversal and use a stable 10-entry page.
3. Sort visible directories, hidden directories, visible files, then hidden files; alphabetize within each category.
4. Render at most 10 entries as full-width rows. Labels use the exact entry name plus semantic folder/file emoji; prompts may be exact paths because path-only prompts mean navigation here.
5. Show compact Path and Entries metadata. Do not duplicate entries as a text inventory or add Refresh when resubmitting the path already refreshes.

Preserve the same ordering and pagination in a numbered fallback. Show a plain directory listing only when explicitly requested or established preference requires it. Never preview credential stores, keys, browser profiles, cookies, tokens, wallets, or secret-bearing files, and never raise privileges merely to enumerate a path.

## Workflows And Actor Runs

Keep exact workflow, Recipe, Run, artifact, or task identity visible. Inspect, pause, continue, redirect, retry, or stop only through the owning runtime contract. Never simulate lifecycle state, bypass Control semantics, or treat a button as execution authority.

## Native Windows

Use the `cua-driver` capability owner for a real, on-space macOS window. Its verdict is the truth, not the exit status: `refused` means it refused to act, `matched` means it proved the target, `unverifiable` means it acted without proof—never render the last two as the same outcome, and never claim success from one. Address state with both `window_id` and `pid`. Windows that are off the current space are refused outright, so read `background_input.routes` before promising an action. Background work keeps the user's focus untouched; an activation that cannot be verified reports `activated: false` rather than pretending.

## Browser Pages

Use `browser-harness` and CDP for page-level work: DOM, navigation, evaluation, and the debugging instance whose windows stay off-space and therefore stay unreachable to `cua-driver`. Do not route page work to the native-window owner, and do not route native-window work to CDP.

## Decisions And Design

Controls may represent conversational alternatives without live inspection. State the decision and material trade-offs in visible text. Each prompt records the selected intent; it does not silently execute downstream consequences.
