# Project Backlog

_This file owns unresolved project work only. Completed behavior belongs in `CHANGELOG.md`; durable contracts belong in `AGENTS.md` and `/docs`._

## routing.test.ts: 184 failures, same root cause (recorded 2026-11-08)

All 184 failures share one cause: **the tests encode pre-0.53.0 live-rebind semantics**. `0.53.0` (`2373619`) changed behaviour and did not update `tests/routing.test.ts`.

Design intent, from `CHANGELOG.md` 0.53.0:

- “Queue acceptance is never removal, replay or another queue grant.”
- “Failed/unknown cleanup keeps the new binding without blocking the next attempt.”
- “Cold/replaced/discarded sources cannot mint ACKs.”

A clean-tree comparison (`git stash` + full run) gives **the same 184 failures**, so none of them were introduced by later UI work.

### Three signatures, fix one group at a time

1. `answer:Input queued in the rebound Thread; old-Thread cleanup is scheduled, not confirmed` — `tests/routing.test.ts:2259`, `:2276`.
   Note the assertions are **two-sided**: one expects the answer to be absent, another compares against the `confirmed` flag. A blind replacement would produce false greens; decide per case.
2. `the selected input has exact admitted receipt authority` — `tests/routing.test.ts:7800`, inside the `handOffQueuedInput` helper: `assert.equal(worker.isQueueReceiptCommitted(receipt), true, …)`.
   **Diagnosed:** the helper runs while the receipt is still uncommitted, and 0.53.0 makes that correct — admission puts input in the queue, while the ACK is minted only when custody actually hands over (“cold/replaced/discarded sources cannot mint ACKs”). Fix by splitting the check in two stages: `false` right after selection, `true` only after the handoff the helper exists to perform. The helper must actually perform that handoff, not just name it.
3. `answer:Live rebind is unconfirmed; this choice never replays issued input` — expected to appear 4× in one case.

Each group needs 2–3 lines of surrounding context read before editing, because the cases live in a fault×rebound×confirmed matrix and the expected value is often a variable.

### Already fixed (reference)

`tests/integration.test.ts` had the same root cause in four cases and is now green: waits target the `connected.` confirmation instead of the retired `menu:model` keyboard, and the live branch expects one confirmation (a rebind, not a re-announcement).
