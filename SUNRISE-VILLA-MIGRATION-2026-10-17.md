# Sunrise Villa To Life OS

Updated: 17 October 2026, Malaysia time.

## Status And Boundaries

The user approved transferring complete business records into protected Life OS migration storage while retaining source copies and leaving existing diary, notes and tasks untouched. Cloud preservation, the newer browser-backup comparison, guarded operational import and local Properties implementation are complete. Live front-end acceptance and final cutover are not complete; the old project's compute billing has not stopped. No percentage is assigned: preserved rows and local tests alone are not evidence of a working production cutover.

| Stage | Status | Evidence or remaining requirement |
| --- | --- | --- |
| Source inventory | Completed for connected cloud and local source repository | Six business tables, nine functions, three scheduled jobs, zero Storage objects |
| Private source backup | Completed | Exact row payloads, function source and clean source-code archive; restricted local permissions, outside GitHub |
| Protected target preservation | Completed | 35 rows, exact SHA-256/readback, repeat import without duplication |
| Existing Life OS state protection | Verified during transfer | Main state timestamp and full-state SHA-256 unchanged; no main-state writes |
| Target access controls | SQL role simulations passed | Owner sees 35; another identity sees zero; anonymous read and signed-in writes denied |
| Browser-local source comparison | Completed for attached October 17 export | All 133 bookings/eight documents compared field by field; one newer payment retained |
| Source-copy reconciliation | Review required | Three workspaces retained; one older booking identity absent from newest; no automatic resurrection/deletion |
| Properties screens and editable repository | Implemented locally, not yet published | Separate operational namespace, shared Life OS session, version-guarded writes and immutable server history |
| Functions and integrations | Nine endpoints deployed; optional integrations off | Four adapted functions, five disabled AI stubs; nightly snapshots/log cleanup active, hourly import inactive |
| Security hardening and signed-in acceptance | Backend checks passed; live acceptance still open | Other-owner SQL denial, anonymous endpoint denial, atomic history/stale-write checks; two remaining advisories |
| Final delta transfer and operational cutover | Not performed | Stop competing writes, repeat comparison, verify original and new records and rollback |
| Old project pause and cost verification | Not performed | Only after successful cutover; preserve recovery rather than delete |

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

Applied browser-preservation migration: `20261016234354_property_browser_backup_preservation.sql`. The original 35 transfer records remain untouched and verified. The local comparison control is true; live acceptance, integration cutover and source-pause controls remain false.

Within each workspace, booking identities were present and unique. One identity found in older copies is missing from the newest; intentional deletion is possible, so retain it for explicit comparison. Older records lack the newer property field; do not invent a property assignment. The ownerless intake candidate is explicitly marked as legacy-project-scoped and must not silently become a confirmed booking.

Nine preserved function sources: `ical-import`, `ota-email-ingest`, `guest-reply-draft`, `receipt-scan`, `tax-review`, `tax-doc-analyze`, `earnings-import`, `ical-cron-sync` and `daily-digest`. Three active source schedules handle nightly snapshots, history cleanup and hourly iCal sync. Secret values and scheduled-command text were not exported. New endpoint configuration must not reuse source-project credentials or blindly copy source policy grants.

## Implemented Operational Boundary

Properties is a native desktop/sidebar and mobile-More destination. The full original operations app runs in an isolated same-origin document, sharing only the current Life OS access token and minimal account identity. It cannot obtain the refresh token. Authentication, styles, globals and local persistence are separate from personal boards.

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

Nightly workspace snapshots and cleanup of only this migration's old scheduler logs are active. Business history is not purged. Hourly iCal remains inactive pending signed-in acceptance and deliberate cutover. Its gateway Authorization now uses the existing public anon JWT from Vault, separately from its private cron secret; JWT verification remains on. A server-originated probe authenticated successfully and returned the expected 409 `migration_not_activated`, with no feed fetch or business write. `supabase/property-calendar-scheduler.sql` records the inactive configuration without embedding either key. An exact pre-publication checkpoint of the current property version is retained in server history.

Version-guarded owner updates retained prior data atomically, and stale writes affected zero rows, in a rolled-back SQL probe. Another authenticated identity saw zero records, including browser backups. Anonymous access and client history deletion/secret access are denied. Security hardening set an existing trigger function's search path and removed client execution from a trigger-only event function without changing its dependencies.

Two advisory warnings remain: [pg_net extension metadata in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), and [disabled Auth leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). An attempted pg_net relocation was rejected because of shared dependency risk; it was not bypassed or applied. These warnings and real signed-in two-device/physical-phone acceptance remain open. No claim of absolute security or full bug-free operation is made.

Private backup directory: `/Users/austinwong/Documents/Codex/life-os-private-migrations/2026-10-17-sunrise-villa/`. It contains `source-data.json`, `browser-backup.json`, `function-sources.json`, `source-code.tar.gz` and private advisory evidence, approximately 1 MiB total. Directory permissions are 0700 and files 0600. This is a private but unencrypted local backup, not independent off-device recovery. The protected target copy is separate cloud preservation. Guest content, financial records, source exports, credentials and attachments must never enter GitHub or public release assets. No data-bearing SQL was placed in the repository; backups were retained.

Removed 17 redundant, regenerable temporary code-candidate directories from this migration's test runs, reclaiming 86,331,037 bytes. Results/screenshots, final candidates, original backups and user browser storage were retained. New private field-check runs delete only their own generated temporary code package after completion.

## Safe Cutover Checklist

### Publication Gate And Paid-Plan Restriction

The release is proposed in [Properties publication PR #1](https://github.com/austinwong94/life-os/pull/1). Its public artifact remains `b454664705239f65`. The ordinary terminal Git credential cannot push this repository; the authorized GitHub connector created a tree matching the local Git tree exactly. No force push or private-record upload was used.

The full GitHub regression gate found a fixed stylesheet-count assumption and two WebKit fixture timing failures. The stylesheet test now checks the exact ordered source manifest and complete CSS bytes. Session tests wait for cross-page storage visibility while keeping application storage events blocked, and install simulated clocks before app timers exist. All original refusal, zero-network and full-record assertions remain. Local acceptance passed 22 startup cases, 36 complete session cases and 20 repeated WebKit edge cases; the full CI run must still pass before publication. No production runtime code was changed to accommodate these fixtures.

A subsequent hosted run passed through cloud/device preservation, session renewal, exports and interrupted-save checks before stopping on planner-review fixtures. Repeated planner seeds had cleared localStorage but retained their earlier verified IndexedDB checkpoint; the application's refusal to overwrite that checkpoint was correct. The fixture now resets both isolated stores and requires a completed setup save. Its stale-review test submits the captured older version, and its primary-write fault targets the actual resolution write rather than an unrelated pending flush. All exact task, independent-board, unresolved-comparison and recovery-copy assertions remain. The corrected suite passed 27 repeated Chromium cases and 18 WebKit cases. No production saving or task logic was altered.

The user confirmed no bookings, payments or documents changed after the attached backup. Final source comparison found the same 35 rows; hourly calendar refresh had regenerated 23 IDs/timestamps, but all 23 underlying availability records matched Life OS exactly. Other source payloads remained unchanged. Local immutable-release regression also passed all 57 cloud-sync cases, 18 task/calendar cases and eight health/recovery cases.

Both projects belong to the same **Pro** organization. Current Supabase documentation and the source dashboard's disabled Pause button confirm that pausing is available only on Free projects. Do not downgrade the shared organization or delete the source to stop its compute. The user approved creating private Free `Sunrise Villa Archive` and transferring only the old source after live acceptance. The archive organization was created (`ihqrtwvrwlgxxqyjloav`); its Team screen confirms exactly one member, the existing owner. No new project, paid plan or member was added.

Supabase explicitly refused transfer eligibility because the owner already has two active Free projects. The source was not transferred or paused. Pausing an unrelated project requires its own explicit authorization; no other project was changed. The transfer-limit evidence is retained outside the repository in `life-os-properties-transfer-limit-20261017.jpg`. Life OS remains on Pro. Free-plan backup/recovery coverage differs; protected Life OS originals and private backups must remain independently retained.

The user subsequently instructed keeping Life OS paid and did not select another project to pause. Preserve that boundary: no other project may be paused to bypass the account limit, and Sunrise compute savings remain unconfirmed.

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
