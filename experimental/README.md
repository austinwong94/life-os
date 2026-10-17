# Incremental device storage prototype

Status: inactive, 16 October 2026. This code is not imported by Life OS or included in its public release manifest. It cannot select the existing checkpoint database through its API. Browser tests use fresh synthetic contexts and new experimental databases; no user migration has run.

## Purpose

The current whole-snapshot path fails the measured large-history main-storage gate. This prototype tests an alternative: an initial full IndexedDB checkpoint followed by small immutable change packets. It preserves the existing JSON workspace rather than inventing new diary, task or board records.

In the tested normalized history, the initial JSON snapshot was 7,830,943 UTF-8 bytes. Adding a sentence to the active diary's board-owned and compatibility copies produced one 2,967-byte candidate containing two field changes. Both Chromium and WebKit stored, published and reloaded the complete result. Original archived writing, unrelated fields and other boards remained part of the verified snapshot. The legacy main commit still failed; its original recovery packets remained intact.

These are JSON payload sizes, not measured disk writes. Publishing also stores a committed entry and a small head receipt, and full checkpoints remain necessary. The figures do not establish a typing-speed improvement, a phone result or a completed replacement for application saving.

## Protocol

| Operation | Behaviour |
| --- | --- |
| `initialize` | Writes a full checkpoint and first head atomically, refuses an existing head, then verifies readback |
| `prepare` | Captures input JSON before asynchronous work, checks the exact base fingerprint, and durably retains an immutable candidate without moving the current head; an optional stable capture UUID permits exact retries after lost readback |
| `publish` | Verifies the candidate, then atomically adds its committed entry and advances the head only if the expected receipt still matches; repeat publishing of that same committed candidate is idempotent |
| `read` | Resolves the current head through its checkpoint/change chain, checking fingerprints and change preconditions before returning a complete snapshot |
| `readCandidate` | Reconstructs a retained proposal independently of the current head, including a proposal refused because another writer won |
| `checkpoint` | Prepares a full checkpoint of an exact earlier receipt; the normal publish guard still refuses it if the head has moved; an optional stable capture UUID permits exact retries after lost readback |
| `candidates` | Reads retained candidates for inspection and recovery; this prototype does not delete them |

Change paths are typed structural paths and are valid only against the exact whole-workspace fingerprint. They are not task commands, stable user-facing record references or a mechanism for guessing identity after arrays move. Object key order is ignored by fingerprints; array order, missing properties, text whitespace and line breaks are preserved. Prototype-shaped property names remain inert own JSON data.

IndexedDB read/write transactions request strict durability. A transaction is not acknowledged until completion, and successful writes receive readback verification. Quota failures, interruptions, missing request acknowledgements, invalid counters, damaged rows and transaction deadlines fail explicitly rather than falling back to an empty workspace. If a head index is missing but entries/candidates remain, both reading-as-empty and initialization are refused. A rejected publish retains its candidate; a committed publish whose readback failed can be retried without another revision. Fingerprints use Web Crypto SHA-256.

The default replay budget is 128 entries. A delta that would exceed it is refused inside the atomic head check before promotion. A verified checkpoint can shorten replay without deleting old versions. A proposal based on the older head still requires an explicit rebase afterward; it is not silently redirected to the new receipt.

## Ordered capture queue

`openQueue({store, onChange})` attaches to a verified existing prototype checkpoint; it does not initialize an empty store. `enqueue(snapshot)` captures JSON synchronously and keeps FIFO changed-field packets for later edits while the current capture/publish is finishing. Caller mutations cannot change already captured text. Every changed snapshot is retained in order; identical input notifications are no-ops rather than duplicate saves.

Only the current edit is prepared/published at a time. A failure pauses subsequent work until explicit `retry()`. A stable capture UUID reuses the exact candidate after lost capture readback, and publishing remains idempotent after a committed write's readback fails. Reusing that UUID with changed content, or colliding with an existing checkpoint, is refused without replacement. The queue never automatically rebases onto another writer's head. By default it pauses when replay reaches its budget; opt-in checkpoint scheduling is described below.

| Queue state | Meaning |
| --- | --- |
| Memory-only | The exact edit is captured in this queue but has no acknowledged durable candidate; closing/crashing the actual tab can still lose it |
| Durable candidate | Candidate readback was acknowledged, but publication is not yet confirmed; it may already have committed if the publish acknowledgement failed |
| Confirmed | This queue verified publication of that edit; the last-confirmed receipt is not a claim that no other writer has since advanced the global head |

`flush()` waits for the active and later queued edits, returning status instead of reporting a failed save as success. `latest()` and `confirmed()` return defensive snapshots for explicit review/export. `close()` refuses unconfirmed work; this is an API guard, not an installed browser-unload warning. Status callbacks contain counts, receipts and allowlisted error codes, not diary text, exception messages or caller-controlled error names. Observer errors cannot stop saving.

The large-history test queued three overlapping diary edits as 7,302 serialized changed-field bytes beside a 7,831,063-byte latest workspace. Both engines drained the three edits in order, verified the entire result and reloaded it, while legacy bytes stayed unchanged during queue operations. This byte count is not heap usage: full confirmed/latest snapshots and the active reconstruction still exist, copying/hashing remain, and an indefinitely blocked backlog can still grow. No frame-latency or sustained-typing performance improvement is certified.

## Opt-in checkpoint scheduling

`openQueue({store, checkpointEvery})` can schedule verified checkpoints before preparing a new edit. The interval counts replay entries, including the initial checkpoint. It must be an integer between one and `store.replayLimit`; zero, the default, disables scheduling. The store exposes its configured replay limit, and the queue requires a verified initial replay depth when scheduling is enabled.

At the threshold, the queue prepares and publishes a full checkpoint of its unchanged confirmed base before preparing the next edit. Its state digest must remain identical. Checkpointing advances the receipt but does not count as a user edit or acknowledge any pending writing. Status exposes a separate `checkpointCount` and the current maintenance identity/acknowledgement flag. There is no idle checkpoint timer, automatic merge or conversion of an already prepared edit to a different base.

Maintenance retains its own stable UUID through explicit retries. Lost staging or publication readback cannot create another checkpoint revision. Quota, interruption, corruption, mismatched receipts or another writer winning still pause the queue; later edits remain captured, and a dirty close is refused. A foreign write after checkpoint confirmation also defeats the following stale edit. The queue does not adopt that foreign state or silently resolve a conflict. The default unscheduled replay-limit refusal remains covered.

In the small-history acceptance, eleven queued edits crossed five checkpoint windows, retained every candidate version, and reloaded correctly. Two more edits after reopening resumed scheduling from the verified depth. The normalized 7.83 MB case completed three overlapping edits through two checkpoints, then verified the entire state and reload without changing legacy bytes during queue operations. These two full checkpoints increase retained storage; this is replay-window management, not garbage collection, a reduced disk-footprint claim or a completed capacity solution. All older entries and candidates remain.

## Explicit stale-head reconciliation

`queue.reconcile(LifeExperimentalBoardReconcile.plan)` is an explicit operation for a `DeltaHeadChangedError` pause, not an automatic retry, cloud request or account-authentication operation. The new inactive adapter reuses `state-merge.js` for canonical board records and conservatively merges the rest of the complete JSON workspace. It preserves unknown root fields and distinguishes missing fields from `null`. Its small metadata exceptions are root `updatedAt`, `updatedBy` and `hasUserChanges`, with type checks. Validated active-board compatibility copies are rebuilt from the merged canonical board for the local view; inconsistent or partial source copies require review rather than normalization.

The queue compares every pending intermediate version against the same confirmed base and verified shared-store head. Only a fully conflict-free comparison can replace its pending packets. Rebased edits get new capture identities; old candidates and checkpoints remain readable. A version already present in the verified head is absorbed without another write, counted separately from locally confirmed edits. If an intermediate version conflicts even though the latest matches, comparison still pauses instead of silently dropping that intermediate version.

Same-field diary writing, planner archive/completion/rename conflicts, concurrent board deletion/edit and colliding new board identities cannot silently choose a winner. Duplicate record identities, unsafe board property names and inconsistent projection shapes require explicit review. `comparison()` returns defensive copies of the compared base, intermediate local version, latest captured draft, shared-store version and conflicts. These contain private content and are not included in status callbacks or diagnostics; the comparison includes its captured revision and can become stale if more writing arrives. No new conflict-resolution UI or automatic deletion was added.

Writing captured while comparison awaits invalidates the plan without replacing the queue. A second shared-store read checks the head before adoption, and subsequent publications retain the normal atomic stale-head guard. The internal planner callback is trusted application code, not an authorization boundary. The tested adapter must still be integrated with actual command guards and account/preview scope before activation.

After successful reconciliation, the editor must load `queue.draft()`, which returns the updated complete `state` and a new `basis` token. Subsequent `enqueue(state, {basis})` calls require that token; missing or obsolete tokens refuse with `DeltaQueueViewChangedError`. This prevents an editor still submitting the pre-merge snapshot from immediately undoing the other tab's records. It is an editing-freshness guard, not a credential, cross-account check or substitute for updating the actual editor state.

The current large reconciliation test independently verifies the complete 7,831,058-byte normalized result: two local diary edits, another board's note, exact compatibility copies, archived writing and other history, through two checkpoints and reload. The original stale candidate and legacy storage bytes remain unchanged during the operation. Reconciliation copies and compares full snapshots for pending versions; latency, memory pressure, lifecycle handling and retained-storage bounds remain open gates. Memory-only drafts still are not durable merely because they have been captured for comparison.

## Verified boundaries

The current reconciliation acceptance passed 348 unit tests and 178 browser cases in Chromium and WebKit. Prototype coverage is 92 cases: 17 original store, 17 queue and 12 reconciliation cases per engine. Application regressions add 86 cases: nine device-concurrency, 23 planner-archive and 11 selected mocked-cloud merge cases per engine. Mocked cloud results do not establish live account synchronization or production authorization. The earlier 325-unit/68-browser checkpoint, 317-unit/50-browser ordered-queue and 306-unit/34-browser initial-store acceptances remain historical, not extra reruns counted here.

Reconciliation cases cover preserved FIFO versions and old candidates, same-field and whole-task conflicts, actual phone-viewport input during comparison, a second writer during comparison, failed reconciled saves, stale editor tokens, malformed/duplicate identities, operation preconditions, lost publication acknowledgement followed by another writer, stale maintenance checkpoints and normalized large-history readback. Pure tests additionally cover unknown-root settings, missing versus null, board deletion/edit, active projections and conservative refusals. Existing store/queue cases retain multiline/Chinese input, thinking pauses, default replay-limit refusal, repeated checkpoint windows, quota/interruption/corruption guards and exact retry assertions.

This increment also fixes an existing application merge defect: only an own property in `deletedBoardIds` can act as a tombstone. Inherited properties such as `toString` or `hasOwnProperty` must not remove a board. Unit tests retain these board IDs and still verify actual own tombstones, including a JSON `__proto__` key. This one-line correction is in the normal source; it does not activate the experimental storage system or change record formats.

The large-history case uses the real application's normalizers and the existing benchmark fixture. During prototype operations, legacy browser bytes are compared exactly. Reload may legitimately append new legacy startup packets; every original packet is checked by key and SHA-256 digest and must remain unchanged. Earlier failed runs are retained separately, including the initial test that incorrectly required no new startup packets and the later stale-versus-checkpoint error-ordering correction. No original-record preservation assertion was removed.

Current evidence: `/private/tmp/life-os-reconcile-20261016/accepted-{chromium,webkit}/{device-delta,capture-queue,board-reconcile}/`. Each suite writes `results.json`; the reconciliation suite also writes `large-reconciliation.json`. The metadata fingerprints match current source: `device-delta-store.js` SHA-256 `7b7368295d0726b3c2c92b2996cb4671772b8ce8e2d95472b02beb88c23adce7`; `board-reconcile.js` SHA-256 `59ecc18ea4d87fcd1ea78b7045fb4978c8aa9ae6dfaaf9a254bfdb2c6997cdc7`. All six prototype suite outputs identify application artifact `d450f02b68e94e79`. Application regression results are under `/private/tmp/life-os-reconcile-20261016/application-{chromium,webkit}/`; unit output is `/private/tmp/life-os-reconcile-accepted-unit-tests.tap`. The immutable application candidate is in that evidence parent's `accepted-candidate/`; its temporary server has stopped. The changed application merge source matches the tested package byte for byte.

CI now invokes the new reconciliation suite in both engines; these workflow changes have not run on GitHub yet. Earlier pre-correction iterations remain separate from accepted evidence. Previous checkpoint evidence remains in `/private/tmp/life-os-checkpoints-20261016/`, and ordered-queue evidence in `/private/tmp/life-os-capture-20261016/`. No preservation assertion was relaxed in this acceptance.

## Required before activation

- Design a verified additive migration, rollback and old/new-tab coexistence policy. Do not replace or clear legacy keys, journals, recovery copies or the old origin by default.
- Connect the tested explicit three-way adapter to actual guarded commands, account/preview scope and editor refresh. A stale prototype publish still refuses by default; reconciliation requires an explicit trusted planner, and both original candidate versions remain available. Structural change paths and editor tokens must not become a shortcut around board ownership, account checks or task-command guards.
- Integrate the now-tested ordered queue with actual writers and truthful save-state UI. Add lifecycle warnings/export for memory-only edits, verify sustained rapid input and IME composition on physical phones, and handle edits while an old release is still open. The standalone queue has not been activated in application writers.
- Reduce and measure whole-snapshot JSON copying, canonical hashing, scans and replay work. The prototype still performs those operations and does not prove bounded main-thread typing latency.
- Integrate the now-tested opt-in checkpoint scheduler with application lifecycle and resource budgets; define backlog pressure handling, storage retention, verified cleanup and off-device recovery. The unscheduled queue still pauses at the replay budget and never drops later drafts. Both modes retain all entries/candidates and can grow indefinitely; checkpoint scheduling is not a complete capacity-management solution.
- Verify sustained writing, suspended tabs, old releases, real separate-board concurrency, exports/restores, cloud compatibility, full/denied storage and authenticated two-device readback. Test physical phones before claiming mobile readiness for the new store.

SHA-256 checks detect content mismatches; they are not encryption or authorization. Database-name restrictions prevent accidental API routing, not hostile same-origin scripts. Existing dedicated-origin, production authorization and cloud-access gates remain open. The prototype contains no account credentials and makes no cloud requests.

## Run isolated checks

```sh
node --test tests/device-delta.test.cjs
npm run test:delta-store
TEST_BROWSER=webkit npm run test:delta-store
npm run test:capture-queue
TEST_BROWSER=webkit npm run test:capture-queue
npm run test:board-reconcile
TEST_BROWSER=webkit npm run test:board-reconcile
```

Use the repository's pinned Playwright installation. `TEST_OUTPUT` selects a synthetic evidence directory. The browser runner builds an allowlisted application artifact, blocks outside requests and never attaches to an existing browser profile. It does not enable the prototype in the normal preview or live site.
