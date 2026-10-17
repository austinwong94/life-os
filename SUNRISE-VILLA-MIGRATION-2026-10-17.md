# Sunrise Villa To Life OS

Updated: 17 October 2026, Malaysia time.

## Status And Boundaries

The user approved transferring complete business records into protected Life OS migration storage while retaining source copies and leaving existing diary, notes and tasks untouched. **Properties is live and accepted with the existing signed-in account.** Original operational acceptance used `f7d222ec680d0468`; the current recovery-hardened release is `4fd526faff13c79d`. Cloud/browser preservation, operational import and scheduled-job cutover are complete. Old-project retirement is blocked by the account's Free-project limit; its compute billing has not stopped. Life OS remains on Pro, and no unrelated project was paused. No percentage is assigned: operational acceptance and billing retirement are separate outcomes.

| Stage | Status | Evidence or remaining requirement |
| --- | --- | --- |
| Source inventory | Completed for connected cloud and local source repository | Six business tables, nine functions, three scheduled jobs, zero Storage objects |
| Private source backup | Completed | Exact row payloads, function source and clean source-code archive; restricted local permissions, outside GitHub |
| Protected target preservation | Completed | 35 rows, exact SHA-256/readback, repeat import without duplication |
| Existing Life OS state protection | Verified through live acceptance | Exact pre-publication checkpoint retained; diary/notes/tasks unchanged; only UI/write metadata and routine countdown seconds changed during ordinary live use |
| Target access controls | SQL role simulations passed | Owner sees 35; another identity sees zero; anonymous read and signed-in writes denied |
| Browser-local source comparison | Completed for attached October 17 export | All 133 bookings/eight documents compared field by field; one newer payment retained |
| Source-copy reconciliation | Originals retained, latest browser copy operational | Three workspaces retained; one older-only booking not automatically resurrected; explicit historical review remains available |
| Properties screens and editable repository | Published and signed-in acceptance passed | All eight views accessible; 133 bookings/eight documents survived reload; existing document preview opened |
| Functions and integrations | Nine endpoints deployed; optional integrations off | Target snapshots/log cleanup/hourly import active; real calendar refresh returned HTTP 200 with 23 blocks; source schedules inactive |
| Security hardening and signed-in acceptance | Backend and live-owner checks passed | Other-owner SQL denial, anonymous endpoint denial, atomic history/stale-write checks; two advisories and physical-device acceptance remain open |
| Final delta transfer and operational cutover | Completed for operational copy and schedules | Original booking/payment/document fields exact; fresh source/target/calendar cache match; immutable rollback copies retained |
| Old project pause and cost verification | Blocked, not performed | Free-project quota prevents archive transfer; source remains active on Pro and continues compute billing |

## Live Acceptance

- [Open Properties in Life OS](https://austinwong94.github.io/life-os/?v=f7d222ec680d0468). Publication commit: `125ca43aa9551bf10a2f1ad7ff8d667d03a5ee33`.
- [PR #1](https://github.com/austinwong94/life-os/pull/1) merged after all release gates passed. [Main verification and Pages deployment](https://github.com/austinwong94/life-os/actions/runs/38993286500) succeeded. All 55 public asset fingerprints matched the accepted local artifact over HTTPS.
- The existing signed-in Chrome account loaded all eight Properties views. Saved documents listed eight entries; an original document rendered successfully. Reload retained access to 133 bookings/eight documents and reported saved cloud state. Live navigation used keyboard activation because the browser-control tool mis-targeted some nested-frame pointer coordinates; isolated Chromium/WebKit pointer checks passed. Physical-phone and simultaneous real-device acceptance remain untested.
- Exact comparison retained every original booking/payment/document field, tax plan, finance payload and existing message-template value. Only missing default template keys were added. Migration history verified all 35 preserved cloud rows plus the attached browser backup against their fingerprints.
- All 23 original calendar availability identities remain. One cached end-date field differs from the attached backup after the real feed refresh; the live cache, target server and current source agree exactly. This is not a deleted booking or payment. The original cache is retained in immutable backup/history.
- Existing personal diary, notes, tasks and other saved content were compared with the private pre-publication checkpoint: no unexpected content differences. Normal live use changed workspace mode, device-write metadata and daily routine countdown seconds. A full-state hash therefore legitimately differs after acceptance; it must not be described as entirely unchanged.
- The private `live-properties-acceptance-20261017.json` receipt records these distinctions. Screenshot: `/Users/austinwong/Documents/Codex/2026-05-04/life-os-properties-live-20261017.jpg`.
- Use Life OS Properties for new property work. The old source is retained but is **not read-only** and has no continuing two-way synchronization with Life OS. Do not edit both apps as competing copies.

## Post-Acceptance Recovery Hardening (Published)

The next increment fixes same-account reconnection without reconstructing a pending booking/payment form. Foreign accounts remain locked out. Migration-history requests are canceled and displayed private originals cleared when the account changes or the dialog closes; a late response cannot populate a new dialog. Original-copy downloads now verify the exact manifest resource/key/hash set, not only total count plus each row's self-reported digest. Duplicate/substituted identities are refused. The loaded header no longer repeats a redundant Open properties action; the locked state exposes an explicitly labelled Reconnect properties control.

All 19 Properties scenarios pass in Chromium and WebKit (38 executions), plus 368 unit tests, 11 Chromium release-startup checks and four existing diary/navigation recovery checks. Both Properties engines used candidate `4fd526faff13c79d`. Three newly added scenarios reproduced failures before the implementation change. Tests use synthetic records and mocked external requests. The phone reconnect screenshot was inspected.

The changes are now [live](https://austinwong94.github.io/life-os/?v=4fd526faff13c79d), main commit `3e8a9e08f5e6cfe390eb88a385d4324f8bb7dac8`. [PR #2](https://github.com/austinwong94/life-os/pull/2) contains the safeguards. [PR #3](https://github.com/austinwong94/life-os/pull/3) makes two existing WebKit fixtures wait for their real expiry/checkpoint preconditions, keeping all original assertions. The first main attempt stopped correctly; two subsequent independent branch/PR runs passed, followed by [successful full main verification and Pages deployment](https://github.com/austinwong94/life-os/actions/runs/39000676865). No release checks were removed or bypassed; the fixture changes did not change public runtime bytes.

All 55 live asset fingerprints match the accepted candidate. The existing signed-in account opened the new release with 133 bookings/eight saved documents and verified all 35 original cloud records plus the browser backup against the stricter manifest checks. The loaded header no longer shows the redundant Open properties action. Parent and property cloud-save indicators both reported saved; no booking, payment, diary, note or task was edited during verification. Normal navigation/device metadata can save. No database migration, source-record edit, schedule, authentication configuration, original-backup deletion or billing change was performed. Proof: `/Users/austinwong/Documents/Codex/2026-05-04/life-os-properties-recovery-live-20261017.jpg`; machine-readable public fingerprint receipt: `/private/tmp/life-os-properties-recovery-live-check-20261017.json`. These close-out notes are updated locally after deployment; no additional documentation-only release was triggered.

## Calendar Import Reliability Follow-Up (Backend Live)

[PR #4](https://github.com/austinwong94/life-os/pull/4), merged as `6bb0aa39fbea80c453d696e399cbe7b47fbaf6c6`, adds bounded streamed UTF-8 downloads and strict calendar completeness/date/event-limit checks to both Properties import endpoints. A stalled body cannot evade its deadline; oversized, malformed or truncated feeds cannot silently replace the last good availability with an empty or partial snapshot. Valid empty calendars remain supported. The existing owner-scoped, all-feeds-success atomic replacement is retained. Migration regeneration keeps the same guards.

Live versions are manual import 3 and scheduled import 2. Exact deployed source/dependency readback passed, JWT requirements remain on, and both anonymous probes returned 401. A real authorized server refresh returned HTTP 200, 24 availability blocks, and no fetch/save errors. The combined before/after fingerprint of bookings (including their payment fields), documents, tax plan and finance payload matched exactly: `13c9cd40360a4df51bb01be0cd3c645dc8325d1d830e003bf9c924eba6b4e48e`. Counts remain 133 bookings/eight documents. Calendar availability is a separate live projection, not a booking or payment count.

Verification includes 15 new offline tests, 383 passing unit tests, Deno type checks, and both complete independent branch/PR release gates. [Final merged-main verification and Pages deployment](https://github.com/austinwong94/life-os/actions/runs/39003769754) passed all four jobs without bypasses. All 35 cloud originals and the browser backup still pass exact payload-hash checks. No production failure injection, personal-state write, database migration, authentication configuration, schedule, source-project pause or billing change was performed. Frontend release remains `4fd526faff13c79d`. Metadata-only receipt: `/Users/austinwong/Documents/Codex/2026-05-04/life-os-property-calendar-acceptance-20261017.json`. These close-out notes are maintained locally pending the next publication.

## Reservation Link And Phone Layout Follow-Up (Candidate)

Render-only validation now permits clickable reservation links only to parsed HTTPS Airbnb/Booking.com hosts, without credentials/nonstandard ports or ambiguous whitespace/control/backslash input. Other links remain plain availability entries; original URLs and all operational data remain saved as before. Booking.com links are no longer mislabelled Airbnb, valid external links retain `noopener noreferrer`, and their accessible names announce a new tab. Both cached and freshly server-imported data use the same guard. Migration regeneration preserves it.

A 320px calendar overflow came from an absolutely positioned screen-reader-only WhatsApp checkbox label escaping its table. Positioning its label container fixes the overflow while retaining the accessible name and horizontal access to every table column. Verification: 389 unit tests, all 21 Properties scenarios in each browser engine, 11 complete-release startup cases and four diary/independent-board writing cases. All use synthetic records; no production record was edited. Hosted release verification and publication are still pending for this candidate. Source billing, database schemas, functions, schedules, authentication and AI settings are unchanged.

## Preserved Scope

| Resource | Rows |
| --- | ---: |
| Workspace data (`app_data`) | 3 |
| Workspace history (`app_data_history`) | 8 |
| Standalone bookings (`bookings`) | 0 |
| Availability blocks (`ical_blocks`) | 23 |
| Intake candidates (`booking_candidates`) | 1 |
| AI usage (`ai_usage`) | 0 |
| Total business rows | 35 |

The latest workspace contains 133 bookings and eight documents. The user-supplied browser backup has the same counts but contains a newer payment absent from the September cloud copy. Both complete originals are preserved; counts alone were not accepted as integrity evidence. Earlier workspace copies contain 79 bookings/one document and 78 bookings/no documents. These are overlapping snapshots, not additive booking totals. Bookings also carry business fields and histories; do not recreate them from calendar dates alone. Zero Storage objects does not mean embedded attachments are absent: the exact JSON payloads retain embedded content.

### Browser Backup And Guarded Activation

The attached `sunrise-villa-backup-2026-10-17 (1).json` was exported at `2026-10-16T23:18:30.349Z` (October 17, Malaysia time). Its exact 105,045 bytes are preserved locally as `browser-backup.json` and in owner-readable, client-immutable `property_browser_backups`. SHA-256: `a5ccf282041a21a5d820b08e39b5ffad86217816ba7db1defb7bd90613515712`.

The comparison found generated empty guest-ID fields, added historical document-payment identities, newer iCal cache metadata/four additional cached blocks, backup metadata and one real booking payment absent from the September cloud workspace. Payment amounts and original financial details remain in private backups, not repository documentation. No original booking, document, attachment or nested field was removed. Tax, finance and message-template values remain intact.

`tools/property-browser-transfer.cjs` rejects foreign owners, missing/duplicate identities and removed fields. Activation locks the canonical target and accepts only the exact preserved baseline or an already-applied identical result. A changed target stops the transaction. It preserves exact browser bytes, maps only active owner metadata to the existing Life OS account and retains the prior cloud version in immutable workspace history. Repeating the import verified one browser backup, not a duplicate. No source data or personal `user_states` row was updated.

Applied browser-preservation migration: `20261016234354_property_browser_backup_preservation.sql`. The original 35 transfer records remain untouched and verified. Local comparison, live acceptance and integration cutover controls are true; source-pause remains false.

Within each workspace, booking identities were present and unique. One identity found in older copies is missing from the newest; intentional deletion is possible, so retain it for explicit comparison. Older records lack the newer property field; do not invent a property assignment. The ownerless intake candidate is explicitly marked as legacy-project-scoped and must not silently become a confirmed booking.

Nine preserved function sources: `ical-import`, `ota-email-ingest`, `guest-reply-draft`, `receipt-scan`, `tax-review`, `tax-doc-analyze`, `earnings-import`, `ical-cron-sync` and `daily-digest`. Three source schedules originally handled nightly snapshots, history cleanup and hourly iCal sync; all are now inactive after verified target cutover. Secret values and scheduled-command text were not exported. New endpoint configuration must not reuse source-project credentials or blindly copy source policy grants.

## Implemented Operational Boundary

Properties is a native desktop/sidebar and mobile-More destination. The original operations app runs in a same-origin iframe with separate styles, globals and owner-scoped persistence. The explicit authentication bridge sends only the current access token and minimal account identity, not the refresh token. **This is UI/state separation, not a security sandbox:** same-origin compromised JavaScript could access parent storage. A separate-origin design and further CSP hardening remain future security work. Properties reuses the existing Life OS identity rather than creating another account.

Operational records use `property_workspaces`, `property_workspace_history`, `property_ical_blocks`, `property_booking_candidates`, `property_ai_usage` and `property_migration_control`. The initial operational model remains a property-only workspace snapshot, not fully normalized booking-level storage. Guarded server versions prevent stale-device overwrite; a browser-owner editing lock prevents two Properties caches interleaving. Other Life OS boards remain usable in separate tabs. Unknown record fields, historical document codes and payment identities survive edits. Removing a personal board/card does not delete property data.

The separate owner-scoped IndexedDB cache avoids adding business records to the main Life OS localStorage snapshot. Main Life OS's previously measured large-history capacity limitation is not solved by this property migration. There is no automatic posting to personal Money: that requires stable explicit links and reconciliation to avoid double-counting.

Opening existing records no longer replaces saved message templates with defaults. Combined-script startup ordering, a sidebar overlay blocking controls and Safari's self-growing invoice preview were fixed. Properties remains mounted when navigating Life OS so an unfinished booking/payment form is not reconstructed. Account changes lock the mounted view without clearing its draft. Migration history verifies original payload fingerprints before allowing a download containing both cloud and browser originals.

## Target Structure

Use one **Properties** operational area within Life OS, with a property selector and these views:

- **Calendar:** arrivals, departures, stays, availability and linked operational tasks.
- **Bookings:** guest details, stay details, booking status, collection and refund history.
- **Money:** received income, expected payouts, refundable deposits, operating expenses and reconciliation.
- **Documents:** quotations, invoices, receipts, balances and original supporting records.
- **Advanced settings:** tax, imports, scheduled integrations and audit/recovery history.

An optional property summary board card should read this same canonical repository. A card must not own another copy of the bookings. Board removal must not delete property records. The existing planner and personal money tracker should receive explicit stable links, not copied transactions that drift independently.

Keep imported originals immutable and separate from operational records. Use owner/property scope, stable source identities, explicit record versions and auditable commands for operational changes. Avoid adding another large snapshot to the main Life OS `user_states`: the existing app's capacity limitation remains unresolved. Reuse the Life OS account/session, mapping verified source ownership without copying source Auth users, passwords or sessions. The isolation boundary above is implemented; future normalized repositories must retain these protections.

## Business Rules That Must Survive

- A booking is the canonical source; calendar appearances are projections, not duplicate booking rows.
- Checkout is exclusive when calculating occupied nights; iCal blocks are availability restrictions, not confirmed guests or income.
- Received payment, expected Airbnb payout and refundable guest deposit are distinct. A deposit is not accommodation income.
- Printing an invoice/receipt or reimporting the same payout must not create a second income transaction.
- Fixed commitments and future expenses are forecasts until payment is recorded; retain one-time versus recurring distinctions.
- Historical prices, payment events, documents, tax details and attachments must remain as recorded, not recalculated from today's settings.
- Linked cleaning/check-in tasks must not cancel or alter bookings when checked, archived or deleted.
- External imports need stable deduplication keys, bounded retries and owner/property scope. Callback functions using custom secrets require a fresh security review.

## Preservation Implementation And Evidence

`tools/property-transfer.cjs` prepares an offline manifest and transactional SQL. It verifies six-table completeness, source ownership, the target mapping, exact payload fingerprints and explicit review of legacy ownerless data. It refuses incomplete exports, foreign-owner rows, unsupported Storage objects and altered prepared manifests. It does not activate records or call a network service.

Applied additive migration: `supabase/migrations/20261016223941_property_preservation_staging.sql`. New tables are `property_transfer_batches` and `property_transfer_records`; authenticated owners have SELECT only, while anonymous clients have no table access. A privileged migration transaction inserts records with exact readback and idempotence checks. Original source ownership stays inside original payloads; verified target ownership is separate metadata. No source policy or Auth schema was restored.

Transfer batch: `acd40670806f1c95608b3deb2fe91875c95e9f129e252523d0bb7d22a57240a3`.

The main Life OS state remained at `2026-10-16 16:01:58.66744+00`, SHA-256 `fde78182dbde3fae876b50fceb8f5a0d0c311d04d42ae8135399bc7a088f6eed`, before and after preservation and browser activation. All 35 source fingerprints also remained unchanged. Current unit result: 368 passing tests, including preservation, browser-import guards and backend authorization/disabled-AI checks. SQL role simulations are not live browser authentication acceptance.

The final local Properties set passed fourteen cases in each engine (28 total in Chromium and WebKit): shared session/namespace, booking edit/reload, stale writes, five responsive widths, standalone denial, payment recording/deduplication, native desktop/mobile access, historical invoice editing, one Properties editor, failed-cache-read retry, AI disabled/read-only navigation, stable invoice-preview sizing, verified original-copy downloads/corrupt-copy refusal and retained unfinished forms/account locking. Evidence: `/private/tmp/life-os-properties-verified-{chromium,webkit}-20261017/results.json`. The failed-read test exposed a lock-release timing race; startup failure now waits for actual release before permitting retry. No assertion was weakened.

Private offline browser checks passed independently for both the preserved cloud copy and the attached newer browser backup: 133 bookings, eight documents, zero changed original business field paths and zero remote writes. They compare every original booking/document/payment/tax/finance/settings field, intercept all network traffic and do not emit screenshots or private values. Existing main Life OS shell (three cases) and paused-writing/navigation (four cases) regressions also passed. Tests do not certify physical-phone use or signed-in production behavior.

### Functions, Jobs And Security

All nine target `property-*` function endpoints require a gateway JWT. Empty anonymous POSTs to each returned 401. Manual iCal additionally validates the live user and owned workspace, bounds request size/time and rejects redirects. Availability replacement is transactional and runs only after every requested feed succeeds, preserving last-known blocks on partial failure.

The user chose **AI disabled**. Five AI endpoints are explicit 403 stubs that do not read the upload body, call providers or use AI secrets; UI controls and the client invocation adapter also refuse them. No guest, receipt, tax or financial data was sent to Anthropic. Unused booking-email/digest callbacks remain disabled. Fresh callback secrets were generated inside target Vault; values were not exposed or copied from the source.

Target nightly workspace snapshots, scheduler-log cleanup and hourly iCal are active. Business history is not purged. Hourly import's gateway Authorization uses the existing public anon JWT from Vault, separately from its private cron secret; JWT verification remains on. The initial server-originated probe correctly returned 409 `migration_not_activated`. After signed-in acceptance, an actual server-originated import returned HTTP 200, 23 blocks and no errors; current source and target availability fingerprints matched. Only then were all three source schedules disabled. `supabase/property-calendar-scheduler.sql` deliberately records an inactive safe replay configuration without embedding keys. An exact pre-publication property checkpoint remains in server history. Disabling source schedules does not stop its database compute charge.

Version-guarded owner updates retained prior data atomically, and stale writes affected zero rows, in a rolled-back SQL probe. Another authenticated identity saw zero records, including browser backups. Anonymous access and client history deletion/secret access are denied. Security hardening set an existing trigger function's search path and removed client execution from a trigger-only event function without changing its dependencies.

Two advisory warnings remain: [pg_net extension metadata in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), and [disabled Auth leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). An attempted pg_net relocation was rejected because of shared dependency risk; it was not bypassed or applied. These warnings, stronger iframe isolation and real signed-in two-device/physical-phone acceptance remain open. No claim of absolute security or full bug-free operation is made.

Private backup directory: `/Users/austinwong/Documents/Codex/life-os-private-migrations/2026-10-17-sunrise-villa/`. It contains source/browser records, function source, clean source-code archive, advisory evidence, the exact personal pre-publication checkpoint and the acceptance receipt, approximately 2.6 MiB total. Directory permissions are 0700 and files 0600. This is a private but unencrypted local backup, not independent off-device recovery. The protected target copy is separate cloud preservation. Guest content, financial records, source exports, credentials and attachments must never enter GitHub or public release assets. No data-bearing SQL was placed in the repository; backups were retained.

Removed 17 redundant, regenerable temporary code-candidate directories from this migration's test runs, reclaiming 86,331,037 bytes. Results/screenshots, final candidates, original backups and user browser storage were retained. New private field-check runs delete only their own generated temporary code package after completion.

Final cleanup removed nine additional redundant public-code builds after verifying every file against trusted release manifests, reclaiming another 45,773,835 bytes. The accepted final artifact, all evidence and all backups remain. Cleanup did not touch user browser storage or business records.

## Safe Cutover Checklist

### Publication Gate And Paid-Plan Restriction

The release was merged in [Properties publication PR #1](https://github.com/austinwong94/life-os/pull/1). Live artifact `f7d222ec680d0468` supersedes `b454664705239f65` and the insufficient grid-only candidate `ecc69222c635b0a7` with scoped reuse-dialog CSS containment; property runtime and data handling are unchanged. The ordinary terminal Git credential cannot push this repository; the authorized GitHub connector created a tree matching the local Git tree exactly. No force push or private-record upload was used. The following paragraphs retain the historical failure/fix evidence; all required PR and main deployment gates subsequently passed.

The full GitHub regression gate found a fixed stylesheet-count assumption and two WebKit fixture timing failures. The stylesheet test now checks the exact ordered source manifest and complete CSS bytes. Session tests wait for cross-page storage visibility while keeping application storage events blocked, and install simulated clocks before app timers exist. All original refusal, zero-network and full-record assertions remain. Local acceptance passed 22 startup cases, 36 complete session cases and 20 repeated WebKit edge cases; the full CI run must still pass before publication. No production runtime code was changed to accommodate these fixtures.

A subsequent hosted run passed through cloud/device preservation, session renewal, exports and interrupted-save checks before stopping on planner-review fixtures. Repeated planner seeds had cleared localStorage but retained their earlier verified IndexedDB checkpoint; the application's refusal to overwrite that checkpoint was correct. The fixture now resets both isolated stores and requires a completed setup save. Its stale-review test submits the captured older version, and its primary-write fault targets the actual resolution write rather than an unrelated pending flush. All exact task, independent-board, unresolved-comparison and recovery-copy assertions remain. The corrected suite passed 27 repeated Chromium cases and 18 WebKit cases. No production saving or task logic was altered.

The remaining local suites exposed two older synthetic sign-in fixtures that populated only in-memory credentials; Google controls and preview isolation now use the normal retained-session function. The Google integration remains disabled in production. All 20 mocked Google-control cases and 22 preview-isolation cases passed across both engines, retaining exact cloud-payload and separate-record assertions. Navigation checks now await the actual post-navigation checkpoint before asserting an empty journal, after first verifying the complete reloaded writing; all four cases passed in both engines. No authentication or data-preservation guard was relaxed. Other follow-on local checks cover responsive health cards, meal/exercise reuse, restore, subtasks, daily/coaching flows, retained editors and interface navigation against the same immutable artifact.

The next hosted run passed planner review but found real horizontal overflow from a long meal-name select on touch WebKit. Reuse-dialog field labels now use a constrained `minmax(0,1fr)` grid and select controls have explicit logical size bounds. The original strict overflow, inert-text, complete nutrition and 44px-control assertions were retained. The rebuilt candidate passed 22 meal-reuse cases, 22 exercise-reuse cases, 22 startup cases, 28 Properties cases and all 368 unit tests locally. Evidence is in `/private/tmp/life-os-properties-grid-*-20261017/`. Hosted Linux/WebKit acceptance remains required. Related browser behavior is documented in [WebKit issue 284644](https://bugs.webkit.org/show_bug.cgi?id=284644); that report is supporting context, not a substitute for testing this release.

A supplemental Linux `property-ui-preflight` job now checks touch WebKit meal/exercise reuse and both Properties engines early, alongside the unchanged full regression job. Deployment requires both jobs to pass. It uses synthetic records and the built artifact, adds no secrets or production access, and does not replace or skip any existing release check.

The early Linux job confirmed grid sizing alone did not contain the native select's internal overflow. Reuse fields now also use the existing Money-form `overflow-x: clip` pattern, with the focus outline moved inside the control; the complete meal name remains wrapped in the separate preview. Failure diagnostics include computed select and field styles without relaxing overflow checks. Final-candidate tests and hosted acceptance must be reported separately from the earlier grid-only run.

The final containment candidate passed the complete Linux preflight. The full serial job subsequently reached its 30-minute runner ceiling near the final checks, with no failing test assertions. CI now runs core/preservation and independent feature suites in parallel. A structured comparison verified exact parity of all 88 original test/type-check commands, names and environments in their original combined order. Deployment requires both complete jobs and the preflight. It also compares the two accepted manifests, rejects extra public files and rehashes every deployed byte. Local verifier probes accepted the complete candidate and refused a changed public file. No assertion or release check was removed, and the public artifact remains `f7d222ec680d0468`.

The user confirmed no bookings, payments or documents changed after the attached backup. Final source comparison found the same 35 rows; hourly calendar refresh had regenerated 23 IDs/timestamps, but all 23 underlying availability records matched Life OS exactly. Other source payloads remained unchanged. Local immutable-release regression also passed all 57 cloud-sync cases, 18 task/calendar cases and eight health/recovery cases.

Both projects belong to the same **Pro** organization. Current Supabase documentation and the source dashboard's disabled Pause button confirm that pausing is available only on Free projects. Do not downgrade the shared organization or delete the source to stop its compute. The user approved creating private Free `Sunrise Villa Archive` and transferring only the old source after live acceptance. The archive organization was created (`ihqrtwvrwlgxxqyjloav`); its Team screen confirms exactly one member, the existing owner. No new project, paid plan or member was added.

Supabase explicitly refused transfer eligibility because the owner already has two active Free projects. The source was not transferred or paused. Pausing an unrelated project requires its own explicit authorization; no other project was changed. The transfer-limit evidence is retained outside the repository in `life-os-properties-transfer-limit-20261017.jpg`. Life OS remains on Pro. Free-plan backup/recovery coverage differs; protected Life OS originals and private backups must remain independently retained.

The user subsequently instructed keeping Life OS paid and did not select another project to pause. Preserve that boundary: no other project may be paused to bypass the account limit. Source project remains active in the original Pro organization: its compute charge has not stopped. Do not downgrade the shared organization, create another paid organization or delete source records as a workaround.

### Remaining Retirement Gate

Operational acceptance and target scheduling are complete. Pausing the old source remains blocked until an explicitly authorized account/quota change permits its Free-archive transfer. No such change was authorized. Retain originals and recovery copies; do not describe the old project as paused or billing retired. Historical-only booking review, an independent off-device backup and real-device acceptance remain separate follow-up work.

### Original Checklist (Evidence Above Records Completed Steps)

1. Capture the original Sunrise browser's unsynced records without clearing storage, refreshing unfinished editors or overwriting its current copy. Compare them with all preserved cloud copies.
2. Review conflicts and the older-only booking identity. Keep both versions when intent is unclear; record decisions without rewriting imported originals.
3. Build and test the operational repository and Properties screens using synthetic fixtures first. Test guest/document/payment editing, cancellation/refunds, dates, availability, reports and reload across desktop and mobile.
4. Adapt functions, owner/property authorization, private secrets and scheduled jobs. Review existing Life OS security advisories before production activation. No service-role key belongs in the browser.
5. Rehearse with the real owner account, verify another account cannot read records, verify signed-out denial and test multiple devices/tabs without lost updates. A dashboard SQL check alone is insufficient.
6. Schedule a write freeze, capture the final source delta and compare complete records and attachments. Switch one writer/integration at a time; prevent old/new jobs from double-processing bookings or payments.
7. Verify the actual application against preserved originals and record a rollback checkpoint. Retain the old source intact until operational acceptance.
8. Pause, rather than delete, the old project only after confirming no client, callback or scheduled job still depends on it. Check billing afterward; already-incurred charges are not erased and other target charges may remain.

## Platform And Billing References

- [Supabase compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute): each project runs a dedicated Postgres instance; low usage alone does not stop compute charges. Paused projects do not accrue compute hours. Organization compute credits and other usage affect the net saving.
- [Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase): database migration is distinct from moving application dependencies.
- [Backup and restore considerations](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): functions, secrets and Storage require separate handling. A full restore over a populated Life OS project is not the selected approach.
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): operational owner/property isolation must be enforced by the backend, not hidden UI controls.
