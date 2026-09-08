# Life OS Reliability and Usability Progress

Updated: 8 September 2026. Base reviewed: GitHub main `1b5480b`.

## Current Decision

**Local review build, not yet a production release.** The live GitHub Pages site and personal Supabase records have not been changed by this work. Tests use synthetic records in isolated browser profiles and intercept database traffic.

The best direction is a personal workspace with a low-effort daily entrance, not an increasingly large collection of tracking obligations. The board remains the complete view. Today is optional, uses the same records, and keeps earlier unfinished plans behind a visible disclosure. There is no requirement to backfill missed months or earn a streak.

Do not interpret a percentage of features built as a percentage probability of safety. There is no defensible "100% bug-free" score. Progress below is based on reproducible checks and explicit release gates.

## Verified Now

**170 checks passed on the current local build on 8 September 2026:** 52 planner/health/merge/journal/conflict checks, 11 browser workflow checks, 19 simulated sync checks, 14 card/layout/export checks, 6 text-conflict browser checks, 14 restoration checks, 7 health-card/usability checks, 9 catalogue/legacy-editor checks, 12 note-to-planner capture checks, 9 whole-task review checks, 8 health-version review checks, and 9 responsive-layout checks. All 12 suites were rerun sequentially after the portrait/phone fixes. The nine responsive scenarios also passed separately in WebKit. The sync stress scenario includes ten rounds of 60 edits across three tabs, with each tab on a different board. This is a reproducible local milestone, not certification of the live database or every device.

- [Open the cloud-disabled local preview](http://127.0.0.1:5180/?preview=1).
- [Release checklist](RELEASE-CHECKLIST.md), including the read-only Supabase inspection steps.
- [Cards, boards and mobile usability review](USABILITY-REVIEW.md): visual findings, useful additions and outstanding phone-readiness checks. The follow-up status distinguishes implemented local fixes from recommendations not yet built or deployed.
- Latest generated browser evidence is in `test-results/` (ignored by Git). The test source is committed only when you choose to publish these changes; no commit or push was performed here.

## Implemented

| Area | Change | Verification |
| --- | --- | --- |
| Task identity | Canonical task IDs replace date/title guessing; duplicate names stay independent | Core and browser regression tests |
| Completion | Selected past-day completion, actual recording timestamp, original planned date, and completion-day history are separate | Core and simulated browser tests |
| Renaming | One task changes across its views; obsolete automatic rename/carryover mutation functions removed | Regression reproducing two overdue tasks |
| Planner records | Removing a source card does not erase shared planner records; archived and removed tasks can be restored in Archive | Browser test |
| Long lists | Today, week, month and upcoming no longer have inaccessible item limits | Unit/code inspection and 21-item browser test |
| Today navigation | A fresh visit starts at today; arrow navigation is session UI state, not a change to the task date | Browser test |
| Device saving | Ordered per-tab write-ahead entries, Web Locks around shared writes, commit acknowledgements and recovery of interrupted commits | Interrupted-save, replay-idempotence and 600-edit/three-tab stress tests |
| Cross-device sync | Three-way comparison against a common payload, conditional server writes, in-flight serialization and conflict pause | Simulated computer/phone tests |
| Concurrent inputs | Live object identities retained during reconciliation; full diary text and project checkboxes survive nearby saves | Browser tests |
| Recovery | Invalid storage cannot be replaced by autosave; restore exits recovery; pre-upgrade raw copy retained; recovery download/restore UI | Browser checks, including exact original-snapshot preservation |
| Restore review | Board-by-board current/backup counts, explicit replacement consent, current-backup download and a mobile-friendly confirmation screen | Cancellation, stale comparison and viewport tests |
| Restore persistence | A local restore keeps automatic sync paused across reloads and tabs; earlier diary safety copies cannot silently undo the chosen restore | Simulated cloud, diary reload and guard-corruption tests |
| Restore coordination | Shared browser lock coordinates cloud saves with restoration; a cloud load cannot replace newer local writing made during its request | In-flight cloud/save and delayed cloud-load tests |
| Restore failures | Backup, safety-setting and primary-snapshot failures leave the original records; unreadable bytes are preserved before replacement | Injected storage-failure tests |
| Text conflict review | Compare current and captured versions of a diary, task title or note; keep one or combine them without restoring an entire board | Field-level, multi-tab and simulated cloud tests |
| Review drafts | Combined writing survives closing/reopening the dialog and reloading the same tab; stale comparisons cannot replace a newer entry | Long-text, stale-entry and mobile browser tests |
| Review safety | Save a recovery copy before applying a choice; blocked backup storage prevents replacement; old tabs cannot resurrect resolved warnings | Storage-failure and stale-tab regressions |
| Cloud review | Conflict details persist after reload; acknowledging a reviewed field is bound to its account and exact baseline; a subsequent cloud edit still requires review | Simulated cloud tests; no live database certification |
| Planner history conflicts | Concurrent changes to a task's schedule, completion or lifecycle retain complete versions rather than mixing fields into a new history | Reproduced completion/reschedule and completion/removal failures; 11 new core regressions |
| Whole-task review | Compare complete task versions with dates and recorded times, explicitly choose one, and save a recovery copy first | Nine browser checks, actual queued writes from two tabs, stale-state/failed-storage checks and two new simulated cloud cases |
| Health record conflicts | Keep a logged food's quantity/unit/nutrition snapshot, an exercise's identity/load, running measurements, body measurements, a food definition or a monthly target together | Three failing reproducers fixed; 12 core cases, 8 browser checks and 2 additional simulated cloud cases |
| Health version review | Show explicit units and all five nutrients, require choice/consent and a recovery backup, refuse stale or invalid records | Meal totals, reload, other-board diary preservation, storage failures and 320/390/768/1440px review checks |
| Storage-full errors | A draft that could not be staged remains in memory and can be saved again after storage recovers | Quota-failure regression; closing the page before recovery/export can still lose an unstaged draft |
| Board loading | Loading old records no longer silently adds templates or removes an old course board | Legacy-board test |
| Tab navigation | Each tab remembers its selected board independently | Three-tab reload test |
| Diary | Full text/newlines retained; optional feeling starts unselected instead of assuming Calm | Browser tests |
| Card editing | Existing diary, planner, fitness, food and other card history is carried forward when editing the same type | Code inspection; broader editor coverage still needed |
| Routine history | Removed automatic 370-day truncation | 500-record regression test |
| Food | Unit changes convert quantity; historical food snapshots retained; horizontal meal scrolling no longer moves the page | Food workflow and scroll tests |
| Food startup | Loading a Food tracker no longer looks up the live board before initialization; imported food records cannot accidentally use the current card with the same ID | All-card download/restore/reload and detached-snapshot tests |
| Fitness | Two-decimal weight entry, body-metric disclosure stability, invalid BMI input guard | Fitness workflow test |
| Health-card usability | Full nutrient names/totals, wrapping food/meal labels, larger controls, all workout parts visible, and container-width-aware layouts | Seven new usability checks, screenshots at 320/390/768/1440px, eight-meal navigation and menu hit-testing |
| Live running pace | Pace updates when distance or time changes without replacing the focused input; detached previews use their own values | Multi-digit/decimal typing, zero-distance and detached-preview regression |
| Filters | Board-only filter disclosure with accurate expanded state; hidden on Today and retains board show/hide preference | Visible-region, view-switching and no-record-loss regression |
| Add catalogue | Seven prominent everyday types; ten other manual types in searchable More types; current legacy template types remain selectable when editing | All 21 supported types edited/saved/reloaded, seven featured types created via the UI, search and keyboard tests |
| Touch selection | Selected priority and diary feeling shown as text; feeling buttons have larger targets and can be toggled off | 320/390/768/1440px layout checks and long-writing/reload regression |
| Safe metadata edits | Motivation text, today's side notes, unchanged legacy completion states and intentionally empty lists survive card updates | Reproduced failures before fixes; populated, duplicate-item and empty-list regressions |
| Note to action | A side note can create a dated task in its own board's canonical planner; original note and draft remain intact | Confirmation/cancel, reload, existing-source reuse, two-tab isolation, duplicate-submit and save-retry checks |
| Capture undo | Undo soft-removes only the newly created task; known subsequent edits block removal, even across tabs or board switches | Same-task edit/completion refusal and unrelated-board preservation tests |
| Exports | Readable archive uses canonical task completion, includes full timestamps; life review added; print layout can span pages | Export checks and generated sample PDF |
| Mobile | Single full-width column, compact header, four-item bottom navigation, larger controls, overlapping header corrected | Chromium at 320, 390, 768 and 1440px; screenshots |
| Portrait Today layout | Full-width intro and adaptive cards; two-column portrait layout places Quick notes below Planner without an unnecessary diary-height gap | Reproduced the 164px squeezed-card failure; Chromium/WebKit, 320-1440px and 700/701px breakpoint checks |
| Board chooser | Compact scrollable choices, wrapped long names, selected-board indicator, keyboard navigation and Manage boards | 24 additional boards, keyboard/focus/scroll checks, separate-tab selection and reload |
| Daily capture layout | Full-width Quick note input, separate Add action, readable diary dates and 44px date/card controls | Actual sample diary/note/task entry, hit-testing, reload and resize while writing |
| Navigation and menus | Consistent four-item phone/tablet bar; card menus float outside clipped cards and stay above navigation | Edit, move, archive, remove/reload preservation; 320-980px menus on short screens; WebKit |
| Mobile card editor | Composer mounted outside the filtered navigation bar; compact screens use an expandable inline preview and reachable save action | Actually entered and saved a sample card; editor tested at 320, 390 and 768px |
| Preview | `?preview=1` disables cloud authentication and sync | Network-intercepted browser test |
| Preview updates | All new client modules are watched; unfinished drafts and saving errors prevent automatic refresh; save status is not replaced by an update message | Reload-guard regression |
| Authentication | Publishable application key is separate from user bearer token; account ownership guard blocks cross-account upload | Header and account-switch tests |
| Automation | Pinned development dependency and GitHub regression workflow added | Local suites run; GitHub workflow not yet run remotely |

## Latest Milestone: Phone and Portrait Layout

The supplied screenshot exposed a nested-grid defect: Today placed its intro and its three-card grid inside separate cells of the ordinary board grid. At 1206px viewport width, each daily card shrank to approximately 164px while the left half of the board stayed empty. Today now uses the full board width. Its cards adapt to available space: one column on phones, two where three would be cramped, and three where they fit. In the two-column arrangement, Quick notes follows Planner while Diary occupies the other column. The ordinary board's saved two/three-column preference and manual card positions remain unchanged; opening a narrow view does not rewrite those positions.

The board title now opens a separate, normal-sized menu instead of inheriting title-size native dropdown options. Long names wrap, choices scroll, the current board is marked, and keyboard navigation, Escape and outside-click dismissal work. The hidden compatibility select remains available to existing code, but is not a second visible control.

Quick notes has a full-width writing field and a separate Add action. Diary date navigation wraps its date/save information instead of truncating it. Planner's add action and card/date controls have usable touch targets. Card menus are mounted outside their clipping containers, with the existing Edit, Move, Archive and Remove actions. Phone/tablet navigation has four equal targets instead of retaining an empty fifth space. Menus stay above that bar even on short screens, and close when resizing.

The nine new browser scenarios cover all 21 supported card bodies, selected board independence, long names, real sample entry/actions, writing retained during resizing, reloads, viewport hit-testing and breakpoint transitions. Layouts were checked at 320, 390, 680, 700, 701, 768, 900, 980, 1080, 1206 and 1440 CSS pixels as applicable. Portrait screenshots include 1080x1920 and 1440x2560. Chromium and WebKit both passed. A stale native-select width assertion was replaced with checks for visible text, a reachable touch target and no overlap with Filters.

Final WebKit screenshot inspection also found a clickable but invisible Quick note options icon. Its inline SVG now has explicit dimensions, with an added geometry assertion. After this icon-only CSS change, both responsive suites and all 12 note-capture scenarios were rerun and passed; the complete 170-check run preceded that final adjustment.

- [Corrected 1206px layout](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-portrait-20260908/today-1206x866.png)
- [Portrait desktop](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-portrait-20260908/today-1080x1920.png)
- [Phone viewport](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-portrait-20260908/phone-390.png)
- [Chromium results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-portrait-20260908/responsive-results.json) and [WebKit results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-portrait-20260908/webkit/responsive-results.json)

These are isolated desktop-browser tests, not a physical iPhone/Android certification. Keyboard appearance, mobile browser toolbars, touch reordering and real cross-device sync still require the staging drill. No personal records, production database, deployment or data schema were changed. The local preview URL is only on this computer; the corrected build needs an accessible HTTPS staging deployment before testing it on a phone.

## What Saving Now Means

1. Each edit is first written to an immutable pending entry for that browser tab. A storage failure is shown instead of claiming success; an unstaged draft is kept in memory while the page remains open.
2. A browser lock serializes writes into the shared device snapshot. Edits retain their order and parent version. If a tab closes before cleanup, acknowledgements distinguish writes already committed from writes still needing replay.
3. Other tabs reconcile from the latest shared snapshot and pending queue under that same lock. Delayed browser notifications cannot roll the view back to an older snapshot. Different boards do not replace each other merely because one snapshot is older.
4. When signed in, cloud saves compare the last synchronized payload with both versions. A concurrent server write must still match the expected `updated_at` value.
5. A conflicting edit to the same field pauses cloud saving and retains the versions for review. A full recovery copy is attempted; a storage failure is reported. It is not silently resolved by choosing the latest whole website.
6. In Recovery copies, text conflicts can be reviewed individually. Saving a choice requires a successful recovery backup first and changes only that text field. If another tab edited it while the comparison was open, saving is refused until the comparison is refreshed. A later conflicting cloud edit is not overwritten by an older choice.
7. Concurrent edits to the same canonical planner task now require whole-task review when its non-title data changes. Dates, completion and archive/removal state stay together. A confirmed choice replaces only that task version, retaining other records and a pre-choice recovery copy. A newer task edit blocks a stale choice. Incomplete legacy histories are not guessed.
8. Concurrent edits to the same supported health record keep complete recorded versions instead of mixing measurements. Recovery compares the versions with their units. Choosing one changes that entry only, after a recovery copy succeeds. Independent foods, exercises, dates, months and boards still merge separately. Ambiguous, moved or hard-deleted records are not guessed.

This is not end-to-end encryption. Local storage and downloaded HTML/JSON contain readable personal information. Use a trusted device/account and protect backups. A browser clearing its entire storage can remove both local records and local recovery copies. Cloud and external backups are still necessary.

## Previous Milestone: Review Conflicting Text

You no longer need to choose a whole website snapshot when the conflict is a diary paragraph, task name, motivation text or similar text field. The comparison shows the board and record, keeps full line breaks, and offers current/captured versions plus a combined draft. No version is preselected on the first review. Text is displayed as text, not executable HTML. The layout was checked at 320px and 390px as well as desktop.

The combined draft is retained in memory and this tab's session storage. It survives a reload in that tab, but is not an external backup or a cross-device draft. If session storage is blocked, the dialog warns you to keep the window open. A successful choice retains a full pre-change recovery copy, subject to the existing limit of five recent recovery copies.

This is deliberately **text-only**. Deletions, dates, measurements, whole-record conflicts and legacy conflicts without an unambiguous field path still use the recovery-copy workflow. A cloud snapshot without a common baseline also needs explicit recovery review. Resolving a task title preserves its independent task ID, original/scheduled dates, completion date and actual recording timestamp. It does not merge separate tasks merely because their names match.

One additional bug was fixed during this milestone: cloud conflict details previously could disappear on reload because they were only held in memory. They are now saved through the device journal before the conflict pause is reported. Resolution receipts prevent stale tabs from resurrecting a reviewed warning, while a genuinely newer cloud edit remains a new conflict.

## Previous Milestone: Tested Backup Restoration

Importing a backup now opens a review showing which boards exist in the current copy and in the backup, including card, archived-card, diary-entry and planner-task counts. Restoring remains a **whole-device replacement**, not a merge or selected-board import. It requires a separate unchecked confirmation. A board absent from the backup is removed from the active device copy only after the pre-restore recovery copy has been saved.

The comparison is checked again against the shared saved records under a browser lock. If another tab changed a board while the review was open, the restore is refused; refresh the comparison and confirm again. Cancelling leaves the current boards and the parent Recovery dialog available. An unfinished card/task editor blocks restoration so its unsaved form cannot be discarded by resetting the screen.

Automatic cloud sync stays paused after a backup restore, including after reload, sign-in and other tabs using this updated client on the same origin. **Save cloud** requires confirmation and still uses the normal conflict/CAS checks. **Load cloud** explicitly returns the device to the cloud copy. Same-browser cloud writes and restores share a lock. This does not stop another phone or old application version from writing to the server; cross-device conflict detection and the release procedure are still necessary.

Old diary recovery entries remain stored but are not automatically replayed into an intentionally restored copy. New diary writing after restoration gets its own restore identity. An unreadable safety setting pauses sync and disables automatic diary replay. Recovery-copy, safety-setting or main-snapshot write failures do not replace the original records. If the original storage is unreadable, its raw bytes are backed up first and remain downloadable.

The all-card download/import/reload test found a real startup defect: Food tracker normalization called a live-card lookup while the application state was still being initialized. This threw inside the loader and displayed the recovery/default board despite retained original storage. Record loading now uses the supplied food record; live-card lookup belongs to editing actions. The round-trip check compares all board/card records, including archived motivation text, full diary lines, project checks, planner completion history, food quantities and body measurements. Only the routine's ticking remaining/duration seconds are excluded from exact equality.

Limits remain explicit: recovery copies are bounded to five; browser storage can still fill or be cleared; imported files' supplementary `localRecovery` snapshots remain in the file rather than being automatically merged into active boards. Invalid/duplicate card or task identities and unsupported card types are refused instead of guessing how to coerce them. Legacy ambiguous exports still need individual review. IndexedDB migration and external server revisions are not implemented by this milestone.

## Previous Milestone: Readable Health Cards and Working Filters

The top Controls button is now named Filters. It is not displayed on Today, where the board toolbar intentionally does not apply. Returning to My board preserves whether that toolbar was expanded or collapsed. Its `aria-expanded` state describes the actual disclosure. The existing workspace-switch behavior still clears search/status/category filters; preserving those selections independently is a separate design decision.

Food tracker now shows daily calories once, plus full Protein, Carbs, Fat and Fiber labels with consumed and target amounts. Narrow cards use two nutrient columns. Meal totals also show all five values, and food/meal navigation labels wrap instead of being ellipsized. Targets and the food library remain in their existing disclosures. Food names and per-food macro details are readable; numeric inputs, date navigation and meal controls have larger targets. These changes use the existing calculations and historical food snapshots.

All nine workout parts wrap into visible rows. A check identifies a logged part and the filled button identifies the current editor. Body metrics retain their existing disclosure state. Running pace now updates during distance/time input without rerendering that input. Initial rendering of a detached preview uses its supplied workout, not a live card with the same ID.

Health layouts respond to the card's container width, including narrow tablet and three-column desktop layouts. Larger labels and targets intentionally use more vertical space where needed; this milestone does not promise that every card is shorter. No card data format, planner source, board ownership, cloud protocol or historical record was migrated. The regression checks compare health records across column/view changes and reload, and hit-test menu options above the new container layouts.

- [Food tracker on mobile](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-polish-20260908/food-mobile.png)
- [Populated workout on mobile](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-polish-20260908/workout-mobile.png)
- [Eight-meal navigation and full meal totals](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-polish-20260908/meal-eight-mobile.png)

All screenshots use synthetic records. The updated code remains local. Physical phone keyboards, touch reordering, live account isolation and real cross-device/offline synchronization are still release gates, not covered by calling the layout responsive.

## Previous Milestone: Simpler Add and Safer Existing-Card Editing

Add now starts with seven choices: Planner-view, Diary, Side notes, Project, Motivation, Fitness log and Food tracker. New forms default to Side notes. Existing card types and familiar names are unchanged. Ten less-used manual types remain in More types, with search that does not clear common form fields or silently change the selected type. An existing AI Lab or Workout template card exposes its current type there too, including after temporarily selecting a different type. Scorecard periods continue to use their existing type values.

The selected type remains visible beside the Type label even when its option is in a collapsed section. Repeated Best for/Time logic panels were replaced by one concise type description. Priority keeps its colour buttons and now shows Normal, Important or Secondary beside the label. Type and priority buttons support arrow/Home/End navigation and keep focus when rebuilt. Initial composer autofocus no longer overrides a selection already focused inside the form.

Diary feelings show a visible selected name or Not set. Tapping the same feeling again clears it. Changes update only the selection controls, without replacing the diary textareas; full multiline writing remains in place and survives reload. On narrow diary cards, all seven feelings use two rows with at least 44px targets. No mood is inferred or selected automatically.

The expanded edit coverage found real defects, not just cosmetic differences:

- Motivation used the empty display description to populate its editor. Updating the card could erase its words. The editor now reads the stored text, including leading/trailing line breaks, and the form preserves that text.
- Side notes generated a new empty entry for today while updating card metadata, then merged it over existing notes. Same-type metadata updates now keep the current notes and drafts, including their IDs and timestamps.
- Legacy Workout and AI Lab edits recreated unchanged rows with new IDs and unchecked status. Unchanged name/detail pairs now keep their original records; duplicate rows are matched once each. This does not guess the identity of a row whose content was changed.
- An unchanged Brief could lose its reviewed status. That status now survives when its sections are unchanged.
- Empty task/exercise/step/brief lists could gain default content during an edit. Existing empty lists now remain empty. New-card defaults are unchanged except for the initial selected card type.

The regression suite first reproduced these failures using synthetic records, then passed after the fixes. It also exercises each of the 21 existing types through opening, updating and reloading, and explicitly checks completion preservation and independent duplicate rows. This coverage does not certify every concurrent editor scenario or recover information already lost in an older version without a surviving copy.

- [Phone Add catalogue](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-catalogue-20260908/catalogue-320.png)
- [Phone diary feelings](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-catalogue-20260908/diary-feelings-mobile.png)
- [Catalogue regression results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-catalogue-20260908/catalogue-results.json)

No personal storage was read, no database schema changed, and no production deployment was performed. The browser evidence uses disposable records with external services blocked. The new suite is included in the local test commands and GitHub workflow; the workflow has not been run remotely.

## Previous Milestone: Side Notes Into Planner Tasks

Each saved side note now has a single three-dot options button containing **Add to planner** and **Delete note**. Delete still asks for confirmation. The note text has more room because its timestamp sits above it rather than occupying a separate narrow column. The menu floats outside the card and is positioned within the viewport; its actions and toggle have 44px touch targets.

Add to planner opens a confirmation dialog with the owning board, area, editable task wording and an explicit planned date. It defaults to today, but accepts past and future dates. The original note can be inspected in a disclosure. Nothing is created until Add task is confirmed; cancellation leaves the note, its timestamp, all other notes and the unfinished capture draft unchanged.

The task uses the existing canonical planner source for that board and area. When no source exists, one hidden source is created using the existing Planner-view mechanism. No new visible card is added and no second task database is introduced. A matching Planner-view displays the task immediately according to its date/area filters. Completing, editing or deleting that task remains independent of the original note.

Save handling rejects repeated submissions while busy. If staging fails after creation, the dialog retains the one created task and offers Retry save rather than adding a second copy. It does not claim cloud success. Keep the tab open if the save status reports an error; an unstaged record can still be lost if the page is closed before storage recovers or an export is made.

The existing 12-second Undo message now has larger controls. Capture Undo soft-removes only the created task by ID, leaving a recoverable removed record and keeping all unrelated edits. It also works after changing boards. If the latest reconciled task has been renamed, rescheduled, completed, archived or otherwise changed, Undo refuses to remove it. This check covers known device state; it is not proof that an unseen edit on an offline remote device cannot conflict later. Real cross-device tests remain required.

The dialog rechecks its note, board, area, account ownership and restore identity after flushing device writes. A stale confirmation is refused rather than writing to a different board. An open confirmation blocks development auto-refresh and backup restoration so a pause in editing is not treated as permission to discard the form.

Twelve new browser checks cover cancellation, source reuse, immediate linked rendering, date selection, multiline/long text, duplicate clicks, quota-failure retry, unrelated-board preservation, concurrent tabs, guarded Undo, stale confirmation, deletion confirmation, keyboard dismissal and 320/390/768/1440px layouts. Every previous suite was also rerun. No production data or schema was accessed or changed.

- [Phone confirmation screen](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-capture-20260908/capture-320.png)
- [Desktop confirmation screen](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-capture-20260908/capture-1440.png)
- [Capture regression results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-capture-20260908/capture-results.json)

The new client module is `note-actions.js`. It is included in the page, local server allowlist, development refresh watcher and release checklist. Project-item conversion and a durable capture/action relationship view are not implemented. Reopening a note and explicitly confirming a second task remains allowed; only accidental repeated submission of one confirmation is prevented.

## Previous Milestone: Planner History Conflicts

The next foundation check reproduced a genuine merge defect: field-by-field merging could combine one tab's completion with another tab's rescheduled date, creating a task history that neither tab had chosen. Concurrent removal and completion could likewise be combined, hiding the completed task behind the removal flag. Two regression tests failed before the fix.

Canonical planner tasks now receive a conservative whole-record comparison when both sides change the same task and a non-title field changes. The current merge side remains intact and both complete versions are recorded for review. Title-only conflicts still use the existing text comparison. Single-sided changes, timestamp-only updates, separate task IDs and separate boards continue to merge without this additional review.

Recovery now shows the available complete versions, including wording, planned date, completion date, visible/archived/removed state and a disclosure for recorded times. Nothing is preselected. Applying a version needs a selection and explicit confirmation, then a successful recovery-copy write. Only that task is replaced; duplicate-name tasks, other boards, original planning dates and the selected version's completion/recording timestamps are preserved. Compatibility planner entries are regenerated from the chosen canonical task.

The task and conflict are rechecked under the existing device lock before writing. If a task changed during review, refresh is required and clears the previous selection/consent. Failed recovery or primary storage writes leave the existing task and unresolved comparison. A cloud choice is acknowledged only for its recorded account and exact common-baseline fingerprint; a subsequent remote edit raises a fresh comparison instead of being overwritten.

The review supports valid canonical tasks in active or archived planner sources, including soft-removed tasks whose records still exist. It deliberately refuses incomplete/ambiguous legacy history, hard-deleted versions, moved sources and unsupported structured records. It does not guess missing completion dates or repair already-damaged historical data automatically. Choosing an incomplete or removed version is an explicit user decision, not an automatic reopening/deletion.

The Recovery close button now stays visible while scrolling; task-review controls use restrained sizing and fit 320/390/768/1440px layouts. The final run passed all 139 checks, including the earlier 600-edit stress test, 11 new core cases, 9 whole-task browser cases, and 2 additional simulated cloud cases. Tests use isolated synthetic data and block real service requests.

- [Phone task comparison](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-planner-review-20260908/planner-review-320.png)
- [Desktop task comparison](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-planner-review-20260908/planner-review-1440.png)
- [Whole-task browser results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-planner-review-20260908/planner-review-results.json)

No live records, schema or deployed application were changed. This improves future merges performed by this build; an already-open older client cannot be forced to follow the new rules. Publication must include the full reviewed bundle after the remaining staging gates. The health-record milestone below extends this work to measurements; moved-card conflicts and other structural changes still need further work.

## Latest Milestone: Health Record Conflicts

Three regression tests first reproduced invalid mixed records. For example, one tab changed a food from 100 g to 200 g, while another changed it to 1 serving. The previous merge produced **200 servings**, a quantity neither tab recorded. Concurrent exercise-name/load edits and distance/time edits could also form a new combination without warning.

The merge now keeps each of these records whole when both sides edit it: a logged food item including its historical nutrition snapshot, a food-library definition including its serving basis, one month's daily nutrition target, one strength exercise, a running/mobility/other workout entry, or that day's body measurements. Separate items/exercises, days, months and boards still merge independently; identical or one-sided changes do not require extra review. Body measurements are deliberately treated as one set, including weight, height and calculated BMI.

Recovery shows current and captured versions with explicit units, full food names and all five nutrition values. Logged-food totals use the existing calculator, not a second nutrition formula. No new buttons were added to the normal cards. The whole-version form is shared with planner review, while the separate record validators and save logic remain domain-specific. No version is preselected; applying one requires a separate confirmation and a successful pre-choice recovery copy.

Applying a version rechecks the complete record, comparison identity, owning card and board under the device lock. A newer local edit blocks stale review; Refresh clears the earlier selection and consent. Failed backup or primary writes leave the prior saved values and unresolved comparison available. Cross-device review receipts are bound to the account and exact baseline fingerprint; a later remote food edit still produces a new conflict instead of being overwritten.

All **161 checks passed** on the final source, including 22 additional cases: 12 core, 8 browser and 2 simulated cloud checks. Tests exercised actual queued writes from two tabs, preserved a diary on a different board, checked meal totals and reloads, and injected failed storage writes. Screenshots were inspected at phone and desktop widths; automated layout/hit-target checks covered 320/390/768/1440px.

- [Phone health comparison](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-review-20260908/health-review-390.png)
- [Desktop health comparison](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-review-20260908/health-review-1440.png)
- [Health browser results](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-health-review-20260908/health-review-results.json)

**Limits:** this is not an automatic repair of already mixed old records. Unsupported or incomplete legacy conflicts, moved cards, hard-deleted entries and broader lifecycle changes across multiple records still need deliberate recovery workflows. Independent fields inside the same measurement set require choosing one version, rather than guessing which combination was intended. This does not add IndexedDB, remote revision history or encryption. No personal database, schema, production deployment or user browser storage was modified by the test fixtures. Staging security and physical-phone/offline checks remain release gates.

## Release Gates

- [x] Critical planner-loss reproducer covered.
- [x] Separate-board concurrent writes and interrupted-save recovery exercised with synthetic data.
- [x] Mobile layout and main daily-entry workflows exercised in Chromium.
- [x] Downloadable readable archive and restore backup remain available.
- [x] Field-level text review, draft retention and refusal to overwrite newer writing exercised with synthetic local/cloud conflicts.
- [x] Whole-task planner conflict detection and explicit version review exercised locally and against a simulated cloud, including newer remote edits.
- [x] Supported health-entry conflicts preserve complete measurements and provide explicit review, including storage failures and later simulated remote changes.
- [x] Backup restoration, cancellation, storage-failure rollback and download/import/reload exercised with synthetic records across all supported card types.
- [ ] Inspect the actual Supabase table grants, policies, constraints and update trigger. See `security/inspect-database.sql`.
- [ ] Prove that two different authenticated test users cannot read/write each other's rows, and a signed-out request cannot access personal records. Use a staging project, not personal diary records.
- [ ] Run a real phone/computer sync test on staging, including offline reconnection and session expiry. Current cloud tests simulate the backend.
- [ ] Test on physical iOS Safari and Android Chrome with the on-screen keyboard. Chromium viewport tests are not equivalent to real-device testing.
- [ ] Review a copy of the real legacy export for ambiguous planner duplicates. Old records without task IDs cannot always be matched safely; already-deleted text cannot be reconstructed from nothing.
- [ ] Verify long printed exports in Safari as well as Chromium.
- [ ] Publish every required script together, run GitHub checks, and verify the deployed version. No deployment performed yet.

## Next Best Work

1. **Verify security and release on staging.** This is more valuable than another card type. No Anthropic key is needed for this phase.
2. **Move storage to IndexedDB with record-level transactions.** The current recovery layer improves safety, but whole-state localStorage snapshots still consume quota and block the main thread. Large images and many years of records need a scalable storage design and a staged migration that never deletes the original copy first.
3. **Extend conflict review to the remaining structural changes.** Text, whole canonical planner tasks and the supported health records now have tested comparison workflows. Moved cards, hard-deleted versions, cross-record lifecycle changes and incomplete legacy histories still need deliberate recovery. Do not guess missing history or silently mix incompatible versions.
4. **Add server-side revisions and tested remote restore.** Local download/import restoration is now exercised. Version history outside the same browser is still needed for accidental changes, device loss and account recovery, with real staging restore drills.
5. **Extend capture only where useful.** Catalogue simplification and confirmed, undoable Side note-to-planner capture are implemented locally. Next consider a project-item destination and a durable relationship view, retaining the original wording, timestamp and owning board. Do not add another planner database or silently move notes between boards. Prioritize staging/reliability gates above more destinations.
6. **Separate domain modules incrementally.** Planner identity, state merging and device commits have been extracted. Rendering, authentication, nutrition, reports and editor state are still too concentrated in `app.js`; the large legacy stylesheet still needs component-by-component consolidation. A total rewrite would increase migration risk.
7. **Build an optional weekly reflection.** Summarize recorded completions and notes; allow choosing one manageable next action and leaving earlier plans parked. Avoid scoring a person's life or interpreting a missing record as failure.
8. **Only then add voice/AI capture.** Start with draft transcription and a confirmation screen showing board, date, matched task and proposed action. Never autonomously overwrite diaries, guess a task match, or mark work complete without confirmation. Model keys belong on a server, not in GitHub/browser code.

## Practical Restart

Start with Today, one small next step, and a sentence or quick note when useful. No backlog-clearing prerequisite. A weekly review can show what was actually recorded without grading missing days. Life OS can reduce friction; it cannot diagnose or treat depression. Persistent low mood deserves support outside the app too.

## Evidence and Reproduction

`npm test` runs deterministic planner, health, merge, journal and conflict-resolution tests. With `npm start` running, `npm run test:browser`, `npm run test:sync`, `npm run test:features`, `npm run test:usability`, `npm run test:catalogue`, `npm run test:capture`, `npm run test:planner-review`, `npm run test:health-review`, `npm run test:conflicts`, and `npm run test:restore` run isolated browser checks. Install test dependencies with `npm ci` and Chromium with `npx playwright install chromium` first. Test data never needs your login. All suites are included in the GitHub regression workflow; the updated workflow has not been run remotely.

Local results and screenshots are generated separately from user storage. Review `tests/` for the exact scenarios and assertions. A passing suite covers those scenarios; it is not a claim that every code path, device or database configuration is safe.

### Repeat-Run Finding

A repeated 60-edit stress test exposed a missed final edit and false conflicts between successive edits from the same tab. The earlier passing run was insufficient. The pending-save buffer was changed from a replaceable snapshot to ordered immutable entries, commits now drain subsequent writes, and stored acknowledgements prevent a committed write from being replayed after interrupted cleanup. The stress scenario now checks ten rounds of 60 edits, plus genuine same-field conflicts, delayed events and blocked writes.

## Research Basis

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): privacy must be enforced by database grants and row policies, not a hidden website link.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): a publishable key identifies the application; the signed-in user's JWT is separate. Never put a secret/service-role key in the client.
- [MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API): locks coordinate tabs within one origin. They do not coordinate different phones or browsers; the server conditional-write check covers that separate boundary.
- [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors): this policy needs an HTTP response header, not a meta element. A direct-open guard was added; production security headers still require hosting verification.
- [NHS low mood guidance](https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/low-mood-sadness-depression/): small achievable goals and seeking support for prolonged low mood informed the lower-pressure daily entrance. This is a product-design inference, not evidence that this app treats depression.
