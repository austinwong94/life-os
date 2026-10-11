# Life OS: Current Status

Latest assessment: [22 September structure and usability review](PLATFORM-REASSESSMENT-2026-09-22.md). Its follow-up distinguishes implemented fixes from the remaining structural and live-service checks.

Updated: 11 October 2026. This is a status of implemented features and verified boundaries, not a claim that the platform is bug-free. Dated milestones below are historical; use the latest section and the release workflow for current status.

## October 11: Follow-Through Upgrade

Application build `2026.10.11-follow-through`. Release candidate `c17695f63315f569`. Deployment must be confirmed by the [test-and-deploy workflow](https://github.com/austinwong94/life-os/actions), not inferred from this file.

- Four main destinations: **Today, Plan, Board, Progress**. Tasks and Calendar are two views inside Plan. Phone navigation has four equal primary targets, with Capture, Archive, Reports, Settings and saving details reachable through the header More menu. Desktop column choices are preserved; phone layouts adapt without changing saved positions.
- Today offers up to three chosen actions or one in Lighter day, with optional next action, estimated minutes, planned start and available-time budget. These optional plans survive closing and same-tab reload. A five-minute start/pause session does not automatically complete a task or increase goal outcomes. Diary and notes remain available on lighter days.
- Progress shows recorded completion actions, original daily-choice follow-through and partial routine checkboxes. Revisions retain the first chosen-action denominator instead of improving the percentage by dropping unfinished choices. Missing records are not labelled failures; there is no combined life score. Completion-action history is not proof of work duration or a measured business outcome.
- Coaching pace uses editable dated checkpoints, not an assumed linear trajectory. Missing measurements stay unreported. Earlier check-ins without an attendance record remain visible for review; a banner is not a claim that the meeting was missed. Recording a checkpoint plan does not create a progress measurement.
- Coming up and weekly review read both canonical dated tasks and activities, without copying them into a second data source. Unknown historical dates and undated source-card items are not guessed onto Calendar.
- New Project, To-Do and single Task ticks save completion dates and full recorded timestamps in their original records. Planner and source-card histories distinguish completion from reopening. Reopening an older task retains its known completion date; Undo restores the exact prior record. Older boolean-only completions remain **Date not recorded** unless explicitly corrected.
- Completion comparisons keep coherent complete versions. Unresolved task comparisons are excluded from confirmed completion totals, with a report warning. Choosing a version retains but excludes the rejected completion action from counted history.
- Readable downloads include original diary/notes/project content, next-step plans and recorded completion history. The separate JSON backup remains the full restore format. No account token is included in either export.
- Neutral workspace surfaces and functional colours separate action, scheduled work, completion, priority, waiting and destructive actions. Existing card themes, urgency corners, user titles and manual placement remain intact. Seven diary feelings remain on one row.

Preservation: no production personal records, Supabase schema, owner policy or conflict choice was changed. Normal storage keys remain compatible. Added metadata is written on explicit task/plan actions; there is no bulk record conversion or inferred past progress. Preview uses a separate namespace and cannot upload its records.

Verification: 99 unit checks passed. Broad packaged Chromium/WebKit regression runs cover existing cards, three editing tabs on different boards, simulated cloud compare-and-swap/conflicts, diary retention, restore and preview isolation. Candidate runs exposed obsolete navigation assertions, a task-toolbar density regression, failed-save retry metadata and a timer that could conceal a saving error. Those issues were corrected and all 57 affected browser scenarios passed in both Chromium and WebKit. The first remote gate then blocked deployment for an additional Linux-WebKit phone-spacing difference; capture/heading spacing was tightened without shrinking touch targets or weakening the assertion. All 18 planning scenarios pass in each local engine against the corrected candidate. The complete exact-artifact remote gate must pass before deployment. This is not a physical-phone, live-RLS or penetration-test certification.

Still open: physical iOS/Android keyboard/offline acceptance; authenticated two-device staging and live owner-policy proof; Google OAuth plus its private backend (not configured); entity-level storage/outbox migration with year-scale crash/quota tests; explicit stable area/project entities; encrypted offline storage and server-side revision history. None can honestly be declared complete by a frontend design pass.

## Workspace Design: Current Local Build

Build `2026.09.22-workspace-polish`, packaged release `ec16032005ca8d4b`. Local only; not pushed or deployed.

- Quieter sidebar, lighter card metadata, consistent menu/date controls, stronger selected navigation, and neutral workspace surfaces. Existing card colours and saved positions are retained.
- Today and Tasks put the task name before secondary metadata. Today has a small completion indicator for the selected next steps only; it remains accurate in Lighter day, keeps completed rows visible and does not claim a life score, goal percentage or on-track forecast.
- Diary and quick-note writing surfaces have consistent spacing, borders and typography. The seven feelings remain on one row. Full text is not clamped, and this pass does not change text limits, persistence, storage keys, cloud behavior or record formats.
- A new design suite exercises five workspaces at 320, 390, 768, 1080 and 1440 pixels, actual three-column task placement at portrait widths, active mobile navigation, retained diary writing and selected-task progress. It is included in both CI browser engines.

Verification: **292 distinct passing checks** (95 unit and 197 Chromium scenarios), plus **88 WebKit repeats**. All 26 browser suite runs passed against artifact `ec16032005ca8d4b`. New visual coverage spans 25 workspace/viewport combinations per engine, with screenshots inspected at phone and portrait widths. Tests also verify selected-task counts after completion/reload, empty/Lighter-day states, full diary retention, one-row feelings, mobile navigation and stable three-column placement. Syntax, workflow YAML, source/artifact hashes and diff whitespace checks passed. Synthetic evidence is in the Codex `workspace-design-20260922` artifact folder. No personal records were used for testing or modified. These results do not certify physical devices or live services.

Remaining next steps: physical-phone keyboard/accessibility acceptance and authenticated two-device staging checks; live owner-policy verification; reducing full-snapshot write amplification without weakening immediate draft durability. Those are separate engineering/release gates, not solved by visual polish.

## Previous Preview Isolation

Build `2026.09.22-preview-isolation`, packaged release `317213f2112a6799`. Local only; not pushed or deployed.

**Confirmed and fixed:** preview previously blocked its own cloud calls but shared the normal page's local snapshot and pending-write queue. An isolated reproduction showed a preview board rename appearing in the normal tab. A signed-in normal tab could then sync those shared records. This was a real application-isolation defect, not evidence that the user's personal records were changed in this pass.

- Preview now has a stable, separate namespace for snapshots, pending writes, recovery copies, diary safety copies, pre-upgrade backups, client identity, cloud metadata, board selection and editor drafts. Device/cloud locks and storage-event handling are separated as well.
- Normal-mode keys, record formats, lock names and recovery behavior are unchanged for compatibility. No existing records were copied, moved, migrated or deleted. Previous unscoped preview records, if any, remain in the existing normal storage; their provenance cannot be inferred safely and no automatic cleanup was attempted.
- Preview rejects cloud credential persistence and low-level cloud reads/writes, not just the top-level Sync action. Saving details identify separate preview records and provide an explicit **Open saved workspace** link, without silently importing or merging data.
- Different boards still merge across tabs within the same mode. A corrupt or interrupted normal journal is not replayed by preview; preview recovery/export/restore cannot include or replace the normal namespace's records through the tested application paths.

Verification: **288 distinct passing checks** (95 unit and 193 Chromium scenarios), plus **84 WebKit repeats**. All 24 browser suite runs passed against artifact `317213f2112a6799`. New tests cover unchanged normal bytes, separated pending recovery/locks/credentials/drafts, preview restore/export, corrupted normal storage, quota failure, same-mode multi-tab edits and a mocked normal cloud save that excludes preview records. Normal storage keys and lock names are checked for compatibility. Phone saving-details screenshots were inspected in both engines. Syntax, workflow YAML, source/artifact hashes and diff whitespace checks passed. Synthetic evidence is in the Codex `preview-isolation-20260922` artifact folder. No physical phone or live account was used for verification.

**Limits:** this is not encryption, an account security boundary or quota isolation. Same-origin browser quota is still shared, and a malicious same-origin script or someone with access to the browser profile could access both namespaces. Save or download unfinished writing before reloading old preview tabs: already-running older code still uses the old shared keys. Old saved tab-local drafts remain under the normal keys in that same tab; do not close a tab containing unsaved writing. Use a separate browser profile or staging origin for large/destructive tests. Private records and production Supabase/GitHub state were not accessed or modified.

## Previous Source-Card Task Upgrade

Build `2026.09.22-card-tasks`, packaged release `d661f265017493a1`. Local only; not pushed or deployed.

- All tasks and Completed now include active Project checklist items, standalone To-Do items and single Task cards, alongside canonical Planner tasks. Rows identify their source; search also matches source-card names. Recurring routines and hidden compatibility containers are excluded.
- Today can select those original card tasks as next steps. Completing a selected task keeps it visible in that selection. Same-name tasks remain independent and every adapter write is checked against its owning board, card and item identity.
- Rename and completion update original fields, not copied Planner tasks. A stale edit, moved/archived source or ambiguous old ID is refused. Edit drafts remain tab-local through closing, filtering and reload. Failed saves revert the attempted source mutation and retain the complete retryable draft. Undo refuses a newer source version.
- Source-card metadata edits now preserve completion states for multiple older checklist items without IDs. They remain read-only in the combined view; no IDs are silently invented.
- No record migration, database change, cloud write, personal-data test or card-position change was performed. The release now includes the source adapter in its public allowlist.

**Boundary:** this is the first source-adapter phase, not a complete task-model migration. Legacy checklist records contain a completion boolean, not reliable completion-day history. Their completed rows say **Date not recorded**, including new ticks through this compatibility adapter. Tasks Today/Upcoming, Calendar and dated weekly totals still use canonical Planner records; they do not guess dates for legacy card tasks. Use Planner/Tasks capture for date/history tracking. Per-item removal for old card formats remains in the source-card editor; there is no invented per-item archive field. Stable area/project entities and a reversible history-aware conversion remain open.

Verification: **271 distinct passing checks** (89 unit and 182 Chromium scenarios), plus **73 WebKit repeats**. All 22 browser suite runs passed against packaged artifact `d661f265017493a1`. New coverage includes source identity, direct edit/completion, both-direction source agreement, same/different-board tabs, failed-save rollback/retry/Undo, retained drafts, archive/restore, ID-less source edits and five viewport widths (320, 390, 768, 1080, 1440). Phone/portrait screenshots were inspected in both engines. Syntax, workflow YAML, source/artifact hashes and diff whitespace checks passed. Synthetic evidence: the Codex `card-task-integration-20260922` artifact folder. This is not physical-device or live-account certification.

## Previous Audit Fixes

Build `2026.09.22-refinements`, packaged release `5d7ed6aeb4db6621`. Local only; not pushed or deployed.

- Settings, Archive and Reports now place and contain keyboard focus, make the underlying app inert, and return focus to the opening control. Safari mouse activation is tracked explicitly because it does not always focus the clicked button. Native capture and recovery remain usable afterward.
- Device commits, resize redraws and input-blur redraws wait until a pressed board control has received its click. Click actions themselves still update immediately. This fixes a reproduced lost-click failure without pausing the actual record save or using an inactivity timeout to clear writing.
- Nutrition reports expose source selection. Matching daily targets count once; conflicting targets are disclosed and no combined progress percentage is claimed. Changing source retains keyboard focus. Reading these reports uses copies and does not normalize the original food records in place. Empty averages are unreported, not zero intake.
- Programme weeks and calendar weeks have distinct labels and visible periods. Existing dates, checkbox records and reflection histories are unchanged.
- Phone layouts use the bottom navigation without repeating the same workspace tabs above. Diary and notes sit above secondary activity/priority summaries; empty secondary sections are omitted. Desktop and portrait layouts retain their navigation and saved column choices.
- Releases use one public-file manifest, deterministic hashes and matched asset cache versions. CI tests the packaged artifact; a dependent Pages job publishes only after its verification succeeds. The repository must first be configured for Actions-based Pages publishing. Local configuration is not proof that the remote gate has run.

Verification: **250 distinct passing checks** (79 unit and 171 Chromium browser scenarios), plus **62 WebKit repeats**, against the packaged artifact. The broad run exposed the Safari focus and interrupted-click defects; a later run caught a delayed archive redraw, which was corrected. The final focused suite was rerun successfully in both engines after stabilizing its pre-click test setup; no behavioural assertion was removed. All final case results pass. JavaScript syntax, workflow YAML, artifact hashes and `git diff --check` also passed. Phone and portrait screenshots were inspected. Synthetic verification evidence is stored outside the public project in the Codex `audit-fixes-20260922` artifact folder.

Preservation: no production data, schema, Supabase policy, saved card layout or private programme was modified. Tests use isolated synthetic records. Task-source unification, reducing whole-state writes, encrypted local storage, live owner-isolation checks and physical-phone acceptance remain open. No forced cloud save or automatic legacy migration was introduced. See [release gates](RELEASE-CHECKLIST.md).

## September 21 Milestone: Daily Workspace

Build `2026.09.21-daily` is implemented and tested locally, not published. The historical September 8 review HTML is not this application.

- Today supports up to three chosen next steps, upcoming activities, the existing programme's weekly checkboxes and target progress, completed-this-week history, and selectable diary/notes cards. Lighter day shows one selected step and optional notes. All tasks and the complete board remain accessible; no dates or card positions are automatically changed.
- Add now opens a shared capture dialog for tasks, notes or experiences, with an explicit path to the existing card composer. Drafts survive same-tab reload, remain board-scoped and are not represented as cloud-saved. Successful capture reuses canonical tasks or existing side notes. Failed-save retries retain full text and avoid duplicate records.
- Existing tasks can link to a specific programme/priority/key result. Waiting on sorts by follow-up date; Parked is an explicit status, excluded from daily carryover but retained in All tasks and Parked; Experiences uses the same task records. Task completion does not invent measured goal outcomes.
- Weekly review assembles completed tasks (including archived completions), recorded priority updates and upcoming activities. Two optional reflections retain prior versions, merge as individually keyed records and appear in readable exports. Drafts are protected after saving and continuing to write. Daily focus references both source-card and task IDs.
- Mobile navigation is Today / Tasks / Add / Calendar / More. Archive, Reports, Settings and Priorities remain reachable. Portrait board columns are unchanged.
- Saving & version distinguishes preview, local development and website use; device writes, pending device copies, known cloud version, changed boards, paused sync and conflicts are separate facts. These indicators do not certify remote durability or resolve a conflict automatically.

Verification this pass: **238 distinct passing checks** (74 unit, 139 existing browser, 12 coaching, 13 daily-workspace workflows), plus **55 WebKit repeats** (12 responsive, 18 planning, 12 coaching, 13 daily). Tests use isolated synthetic data and block external application requests. Initial runs caught phone toolbar density, a too-small capture control, draft continuation, and ambiguous focus references; the affected suites were rerun after correction. Screenshots were inspected at phone and portrait widths. Test navigation was updated for the new capture and review entry points, not bypassed.

No production records, database schema, policies, personal programme files or account credentials were changed. No live deployment was performed. Saved review records use a hidden known-type non-planner container, so older planner writers cannot accidentally append tasks into it; board backup round-trip is tested.

Still required: configure Google OAuth and implement/deploy its private backend; verify live Supabase owner policies and an authenticated two-device session; perform physical iOS/Android keyboard/offline/reconnect acceptance; publish the verified build. You confirmed Google is not configured. No Supabase connector is available in this session. See `GOOGLE-CALENDAR-SETUP.md` and `security/inspect-database.sql`. Recurrence, subtasks and voice/AI remain future work, not claimed as finished here.

## Priorities: Local Review Build

The follow-up simplifies daily use: one selected priority at a time, directly saved weekly and milestone checkboxes, compact number entry, short activity capture with reversible checked history, and optional goal thoughts. Goal percentages average capped core-target ratios; missing updates are shown, stretch targets are excluded, and the result is not labelled as a pace forecast or a life score. Weekly and monthly activity feedback shows smaller steps separately. Notes never artificially increase completion.

The simplified build passed **225 distinct checks** (74 unit, 139 existing browser regressions and 12 coaching workflows), with 12 coaching repeats in WebKit. Its full configured CI gate has 42 WebKit repeats; the 30 older WebKit cases were not rerun in this pass. Coverage now includes failed checkbox saves reverting visibly, multi-digit direct entry, complete thought drafts surviving quick ticks and cross-tab changes, independent weekly fields merging, and all three priority views at five viewport widths. No publishing or live data writes were performed.

A board-specific Priorities workspace is implemented locally, not yet published. It supports private programme import, measurable key results, activity evidence, weekly reflections, dated coaching check-ins, reversible record exclusion and a readable review download. Next actions are canonical planner tasks, shared with Tasks and Calendar. An explicit calendar action adds check-ins without duplicates. No personal programme or progress is embedded in public source or test fixtures.

Programme records use an archived, hidden source record that older clients preserve, rather than a new root board field that older normalizers would drop. Existing saving, keyed record merging and backups retain the records. Unsaved editor drafts are tab-local and visibly marked as not synced; Save record is required before they enter the board's saving flow. No Supabase schema or policy changes are required. This does not certify live cloud synchronization or resolve an existing conflict warning.

The first priorities implementation passed 217 distinct checks, with seven priorities workflows repeated in WebKit. The follow-up totals above supersede that milestone. Physical-device acceptance and authenticated cross-device testing remain outstanding.

## Current Direction

A private personal workspace: boards hold your records, Today provides a daily entrance, Tasks organizes actions, and Calendar brings dated planner tasks and activities together. The next priority is dependable daily use and proven cross-device recovery, not adding more overlapping card types.

## September 15 Design Changes

- Portrait-column correction: three board columns now fit from 900px of actual board width, rather than requiring 984px after sidebar and margins. The previous threshold could show two columns with 3 selected on a 1079px portrait desktop. New assertions require three distinct visible columns at 1055, 1079 and 1080px viewport widths, with no card loss, body overflow or saved-position changes. Phone fallback remains one column and preserves the three-column preference for returning to desktop.

- Consolidated task heading, area filter and search; task views and day navigation share a row where space permits.
- A single desktop capture row replaces the oversized stacked form. On phones it wraps without reducing the native input text below 16px.
- Consistent 36px mouse controls and 44px phone controls; 14px desktop task text and 15px phone task text.
- Task names lead each row. Dates, areas, project labels and status wrap below with explicit spacing, rather than overflowing fixed-width badges.
- Mobile search expands on demand. An active search cannot be hidden, including when resizing from desktop, and capture text is preserved.
- Calendar mouse controls use the same sizing. Existing diary/card layouts and board column positions are not redesigned or migrated in this pass.
- Fixed a legacy CSS override that positioned task menus relative to the page instead of the viewport, making them disappear offscreen after scrolling. All three actions are hit-tested above the phone navigation.
- Added visible column choices to both workspaces: My board has 2 / 3 columns next to its navigation; Tasks has 1 / 2 / 3 next to the task count. The board control uses its existing saved preference and Settings remains synchronized. Task columns are a board-scoped, tab-local preference retained on reload; they do not change card positions or cloud records. Narrow screens reduce the displayed columns without changing the selected preference, and an open task editor spans the available width without losing its draft.

## Feature Progress

Calendar now reads existing dated planner tasks on the active board in Month, Week and Agenda. It does not create duplicate activities, invent dates for undated tasks, or copy unfinished tasks onto future calendar dates. Calendar task actions use the same canonical task records as Tasks and Planner; completed tasks remain on their scheduled date with completion metadata. Today carryover and completion-day history are unchanged. Archived/deleted tasks remain recoverable but are excluded from Calendar.

For a one-day activity, changing Start date also changes End date. Choosing a different End date makes it independent; invalid intervals are rejected. This works for timed and all-day activities and retains unfinished drafts. Testing also exposed and fixed a Planner card's stale captured submission date and a deferred-refresh gap that could leave another tab's edit invisible after a typing guard expired.

| Area | Status | Remaining work |
| --- | --- | --- |
| Boards, Today, diary and side notes | Implemented with saved history and regression coverage | Continue real-device validation; protect external backups |
| To-Do, Project and other card types | Implemented; legacy one-off tasks are now source-linked in All tasks, Completed and Today next steps | Date/history-aware conversion is not implemented; recurring habits remain separate |
| Tasks | Implemented: areas, project labels, status, dates, deadline, priority, notes, completion history; local upgrade adds goal links, follow-up dates, Parked and Experiences | Publish local upgrade; recurrence, subtasks and a dedicated project entity remain future work |
| Calendar | Implemented: Month, Week, Agenda, dated planner tasks and timed/all-day/multi-day activities | Recurrence and live Google synchronization remain unimplemented |
| Priorities and coaching | Local implementation: private goals, evidence, weekly reflection, check-ins, linked next actions and exports | Publishing, private programme import on the live board and real-device acceptance remain pending |
| Fitness, food and reports | Implemented, including history and readable exports | Real-user report usability and ongoing calculation regression coverage |
| Device saving and recovery | Implemented: per-tab write-ahead records, backup/restore, conflict comparison | Browser storage is not an encrypted vault or an off-device backup |
| Cloud synchronization | Implemented with simulated conflict and concurrency tests | A review warning was previously observed; its current live status was not inspected in this pass. Authenticated phone/desktop acceptance is not certified |
| Mobile/portrait layout | Responsive implementation and Chromium/WebKit checks | Physical iOS/Android keyboard, offline/reconnect and same-account testing remain important |
| Google Calendar | Separate-event creation only | Secure OAuth backend, private token handling, import/sync and disconnect flow are not connected |
| Voice/AI assistant | Not connected | Server-side credentials, draft-first proposals and explicit confirmation before changing records |
| Security | Client-side isolation and conflict safeguards implemented | Live Supabase RLS/owner-isolation evidence, security headers and independent review remain incomplete |

There is no honest single "100% complete" percentage across those different concerns. The core workspace exists; integration, live security assurance and physical-device acceptance are not complete.

## Data and Deployment

This release changes client presentation, date entry and deferred view refresh. It does not change the board schema, write-ahead saving protocol, cloud payload or database policies. Calendar reads the existing planner source. Supabase already receives saved boards through the existing `user_states` flow; no SQL migration is required.

No personal records are used as test fixtures. No production diary/task deletion, bulk replacement, forced cloud upload, account reset or conflict-version choice is authorized by the visual cleanup. An existing "Changes need review" warning requires comparison, not a blind Save cloud or Load cloud action.

## Verification and Next Steps

The columns baseline `289b432` passed 194 checks plus 24 WebKit repeats. The Calendar follow-up adds two core and five browser scenarios, making the gate **201 checks plus 29 WebKit repeats**. Coverage includes automatic one-day ends, explicit multi-day intervals, leap years, draft retention, original planner-card entry, linked edits and completion history, archive/restore, board/area isolation, ongoing activities without duplicate rows, cross-tab updates and 13-task lists at 320, 390, 768 and 1080 pixels. A first candidate stopped on WebKit reporting aborted development file-watcher fetches during reload. Responsive and planning tests now explicitly opt out with `liveReload=0`; a separate regression verifies that normal local previews still watch source changes. Production behavior and error assertions are unchanged. Existing column, mobile, recovery, sync and card regressions remain in the full gate. See [GitHub verification and deployment](https://github.com/austinwong94/life-os/actions) for the exact published commit's outcome.

The portrait-column follow-up adds one scenario in both browser engines, bringing the full gate to **202 checks plus 30 WebKit repeats**. The all-card overflow sweep now also covers the sidebar breakpoint and both sides of the three-column threshold. The earlier test verified preference persistence and overflow, but did not require three actual board columns at the reported portrait width; that coverage gap is now explicit.

Next priorities:

1. Review the existing saved-data conflict with a private recovery backup, without guessing which version is correct.
2. Verify the actual Supabase policies using `security/inspect-database.sql`, then test separate accounts and simultaneous phone/desktop sessions with disposable records.
3. Complete a physical-phone acceptance pass, including keyboard visibility, offline saving and reconnection.
4. Implement secure Google Calendar read-only import before considering two-way editing. See `GOOGLE-CALENDAR-SETUP.md`.
5. Add recurrence/subtasks only after the shared task model and recovery workflow remain stable in normal use.
