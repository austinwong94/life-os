# Life OS Cards, Boards and Mobile Review

Reviewed: 8 September 2026. Scope: the current local build at `http://127.0.0.1:5180/?preview=1`, not the deployed GitHub Pages version.

## Verdict

**The responsive foundation exists. The mobile experience is not finished or release-verified.** The most useful next work is to make existing cards easier to read, capture into, and return to. Adding many more tracking types would increase the decisions required to use an already complicated catalogue.

Life OS should let you capture something useful on a low-energy day and leave without needing to maintain the rest of the system. Missing records must not be interpreted as failures. The complete board should remain available; Today should be a convenient view of the same records, not a competing database or a permanent filter.

The initial review created only documentation and synthetic browser evidence. A subsequent implementation pass addressed the local UI issues listed below. Neither pass published code, accessed personal browser storage, changed cloud records, or migrated/deleted existing cards.

## Follow-Up Status

Implemented locally after the initial review, 8 September 2026:

- The inert Today control is removed from that view. The My board disclosure is named Filters, uses `aria-expanded`, and retains its expanded/collapsed preference across view switching.
- Daily and meal nutrition totals have full labels; narrow cards use two nutrient columns. Food names and meal-tab labels wrap. Numeric inputs and meal-navigation controls have larger targets.
- All workout parts are visible in wrapping rows, with separate logged/current-editing indicators. Running pace updates without replacing the active input, and body-metric disclosure state remains intact.
- Seven new regressions cover disclosure behavior, phone/tablet/desktop layout, eight meals, quantity conversion/removal, live pace/decimal input, detached preview isolation, unchanged saved health records and menu hit-testing. All 96 checks across the current local suites passed.
- A subsequent catalogue/editor pass now shows seven main choices and ten searchable More types, keeps all 21 existing types editable, displays selected priority/feeling names, and adds keyboard navigation. Existing names remain unchanged; new forms start with Side notes. Duplicate guidance panels are gone.
- Nine further regressions exposed and now cover Motivation text being cleared, today's side notes being overwritten by an empty metadata-form entry, unchanged legacy rows losing completion and empty lists gaining defaults. That milestone passed 105 checks.
- Side notes now offer Add to planner through a three-dot menu. Confirmation includes board, area, task and date; the original note stays unchanged. Task-specific Undo checks for subsequent edits, and failed saving can be retried without duplicating the task. Menus, confirmation and Undo have larger touch targets. Twelve new checks plus the complete previous suite pass: **117 checks total**. Details and limitations are in PROGRESS.md.
- A later foundation pass fixes mixed planner-history merges and adds whole-task comparisons in Recovery. Complete versions show planned/completed dates and archive/removal status; selection, confirmation, stale-state checks and a recovery copy are required before applying one. Recovery's close button stays visible while scrolling. **139 checks now pass**, including 22 new core/browser/simulated-cloud cases. No live data or deployment was changed.
- The health-review pass adds whole-version review for conflicting food entries, food definitions/targets, workout measurements and body measurements. Units and all five nutrition values stay visible. It fixes reproduced mixed-unit and mixed-workout merges without adding card buttons. That milestone passed **161 checks**, including another 22 cases. The comparison is tested at 320/390/768/1440px; physical-phone and live-backend checks remain open.
- The latest portrait/phone pass fixes the screenshot's nested Today grid, title-sized board dropdown, narrow Quick note field, truncated diary dates and clipped card menus. Phone/tablet navigation now consistently uses four equal spaces. Today adapts to one/two/three columns without rewriting the board layout. **170 checks now pass across all 12 suites**, with the nine new responsive scenarios also passing in WebKit. They cover all 21 card bodies, actual sample capture/actions, manual positions, long board names, independent tabs and unfinished writing through resize/reload. See PROGRESS.md for screenshots and explicit real-phone limitations.

Not completed: capture-to-project conversion, a durable capture/action relationship view, touch reordering, a fully shared card-header/date system, expanded writing mode, and real-device/live-sync/security release checks. Existing search/status/category selections still reset when switching workspace modes; only the toolbar's show/hide preference is retained. The original findings below are the pre-change evidence, not a claim that the implemented defects remain present.

See [latest implementation progress and screenshots](/Users/austinwong/Documents/Codex/2026-05-04/life-os/PROGRESS.md).

## What Was Checked

- Isolated Chromium profile, cloud-disabled preview, external HTTPS requests blocked.
- Seven populated/sample card types: Planner-view, Diary, Side notes, Project, Motivation, Fitness log and Food tracker.
- Five planner tasks, including earlier dates; multiline diary writing; a side note; long project tasks; running and chest entries; two-decimal body weight; five named meals and sample food.
- Board layouts at 320, 390, 768 and 1440 CSS pixels, plus Today, Add and a card menu.
- No page-wide horizontal overflow or uncaught JavaScript exceptions in the final inspection run. This does not mean every individual label fits: some labels are explicitly clipped with ellipses.
- The earlier 89-check reliability milestone is documented in [PROGRESS.md](/Users/austinwong/Documents/Codex/2026-05-04/life-os/PROGRESS.md). Those suites were not all rerun for this visual review.

The diagnostic control-size inventory is not a WCAG conformance result. A small checkbox may have a larger clickable label, and minimum-target rules have exceptions. Physical devices, screen readers, keyboard-only operation and every card state still need dedicated verification.

## Original Findings

### 1. Today has a control that does not reveal anything

**Confirmed behavioral defect.** On Today, clicking the top controls button changes its label from "Show controls" to "Hide controls" and sets `controlsOpen` to true. Both the toolbar and summary strip remain `display: none`.

The conflict is between [renderBoardMeta](/Users/austinwong/Documents/Codex/2026-05-04/life-os/app.js:2576) and the [Today-specific CSS](/Users/austinwong/Documents/Codex/2026-05-04/life-os/experience.css:55).

Recommended fix: name the board-toolbar action **Filters**, use `aria-expanded` for its disclosure state, and show it only where those filters apply. Keep **Settings** for board configuration and sync. Switching back to My board must preserve its previous filter state. Do not expose a button that appears to work but cannot reveal its target.

Acceptance: each visible disclosure changes a visible region; its accessible expanded state agrees with the region; switching views never hides records without a clear route back.

### 2. Food tracker fits the phone, but its information does not

**Confirmed visual issue.** At 390px, five macro columns show abbreviations `P`, `C`, `F`, `Fi`; a calorie target is shortened to `2200 k...`. Food names and the active meal explanation are also truncated. Several nutrient labels are around 8-10px. See [mobile Food tracker](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/food-mobile.png).

The fixed five-column layout and explicit text clipping are in [styles.css](/Users/austinwong/Documents/Codex/2026-05-04/life-os/styles.css:5996).

Recommended fix: calories as a concise headline, followed by readable Protein, Carbs, Fat and Fibre values in two columns or compact rows. Let full food names wrap. Keep the selected meal and its food list central; retain the existing Add food and target disclosures, but reduce nested borders and repeated instructions. Changing the layout must not change historical food snapshots or monthly targets.

Acceptance: all five totals and units are readable at 320px; meals 1-8 remain reachable; adding, adjusting and removing a food can be done without losing the active meal or collapsing an unrelated section.

### 3. Fitness navigation conceals some available body parts

**Confirmed discoverability issue, not a claim that the hidden tabs are unclickable.** The body-part row scrolls horizontally, but its scrollbar is hidden and the next label is cut at the edge. Buttons are approximately 26px high. See [populated mobile Fitness log](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/fitness-mobile.png) and [fitness-parts styles](/Users/austinwong/Documents/Codex/2026-05-04/life-os/styles.css:5550).

Recommended fix: an expandable wrapping body-part selector or obvious previous/next controls, with a clear distinction between "included in this workout" and "currently editing". Keep one detailed part open. Show the session summary without duplicating the same selection state in multiple rows. Label RPE as perceived effort with optional explanatory help, not as a mandatory field.

Acceptance: every body part is discoverable without guessing a swipe; switching parts preserves numeric input, decimal precision and the body-metrics disclosure state.

### 4. The Add catalogue requires too much interpretation

**Confirmed information-architecture issue.** Add presents 17 choices; the model supports 21 types. Planner, Planner-view, To-do, Task and Project are neighboring but overlapping concepts. Routine, Schedule and Scorecard require another mental comparison. See [mobile Add](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/add-mobile.png) and [type definitions](/Users/austinwong/Documents/Codex/2026-05-04/life-os/app.js:274).

Recommended first-level catalogue: **Planner, Diary, Quick notes, Project, Motivation, Fitness, Food**. Offer other types through an explicit "More types" section and useful templates. Treat planner input and planner date views as one user-facing family with one board-specific source. Preserve existing internal type IDs and existing cards; catalogue simplification is not a data migration.

Keep shared editor fields in stable positions. Remember recently used types and allow search. Do not make users navigate all 17 choices to capture one thought.

### 5. Icon-only meanings are not always available on touch

The priority swatches have accessible names and hover/focus tooltips, but the mobile Add screen shows only grey, pink and yellow. The diary also relies on interpreting small faces. See [priority rendering](/Users/austinwong/Documents/Codex/2026-05-04/life-os/app.js:7509).

Recommended fix: keep the compact colour buttons requested previously, but show the selected meaning beside the Priority label, such as "Priority: Important". Likewise show the selected feeling name without requiring a hover or adding seven permanent word labels. Do not introduce automatic mood interpretation.

### 6. Mobile card positioning lacks a verified touch alternative

Card rearrangement uses native `draggable` behavior in [renderCard](/Users/austinwong/Documents/Codex/2026-05-04/life-os/app.js:3382). The inspected card menu has Edit, Move to board, Archive and Remove, not a move-before/move-after alternative. Physical touch reordering has not been verified.

Recommended fix: an explicit Reorder mode with accessible positional controls, followed by touch drag if needed. Keep it out of ordinary card editing. Desktop column preferences and manual placements must survive opening the same board on mobile; one mobile column must not rewrite the saved desktop layout.

### 7. Card chrome and vertical density remain inconsistent

Project uses small checkboxes, bold progress labels and a compact footer; Planner uses larger rows and multiple date/title layers; Diary has a cleaner writing layout; Food and Fitness retain several nested panels. Today also adds a heading and explanatory sentence before a planner that repeats Today again.

Recommended fix: one shared card header and menu pattern, one date-navigation pattern for dated records, consistent field labels, and fewer enclosing borders. Keep titles and dates meaningful rather than removing all context to save space. Allow Food/Fitness to collapse to a useful summary, and Diary/Project to expand into a focused writing/detail view. Collapsing must never clear a draft or record.

Adapt dense card content to its actual container width, not only the whole screen. Two narrow tablet columns can need the same inner layout as a phone card. Avoid forcing equal card heights: that produces blank space and clips long writing.

## Board Structure

Start with one personal Home board, not a mandatory set of Work, Health, Finance and Personal boards. Separate boards remain useful where you actually want separation.

- Keep My board as the complete, stable view. Today remains optional and reversible.
- Offer pinning and per-device compact/expanded presentation. Do not automatically reshuffle cards while someone is reading or typing.
- Keep the board-name switcher. Add search/favourites when there are enough boards to justify it; do not create another navigation panel for a small list.
- Surface record scope clearly when adding or moving something. Shared planner data stays within its owning board. Any future cross-board overview should be explicit, read-only by default and labelled by source board.
- Reserve Archive for putting things away without erasing their history. Use distinct, accurate wording for recoverable removal versus permanent deletion.
- Keep save status visible and actionable. Device-saved and cloud-synced are different states, especially on a phone.

## Useful Additions, Without More Tracking Burden

| Idea | Best implementation | Why it earns a place | Guardrail |
| --- | --- | --- | --- |
| Capture inbox | Improve existing Side notes | Record a thought without choosing a date or category; later keep it, turn it into a task, or attach it to a project | Preserve original wording and timestamp; conversion must be explicit and undoable, with a visible destination board |
| Weekly reflection | Extend existing Review, with an optional saved reflection | Surface recorded completions and notes, then ask what helped and one small next step | No streak penalty, backfilling requirement, invented accomplishments or life score |
| Something to look forward to | A lightweight Project/notes template | Keep enjoyable ideas, meetups and trips visible alongside responsibilities | Dates optional; not every enjoyable thing needs a target or completion percentage |
| Waiting on | A planner state and filtered view | Track an external reply or dependency without making it a task you are failing to finish today | Same canonical task ID, optional person and follow-up date; no duplicate planner database |
| Life admin | Event/Project template | Renewals, appointments and documents you otherwise remember too late | Optional dates and reminders; avoid storing passwords or sensitive document scans by default |

First choice: **Capture inbox**. Second: **Weekly reflection**. Third: **Something to look forward to**. Only add Waiting on when the simpler flow is working well. More card types are not automatically more useful.

A realistic daily loop is: capture a thought, choose one next action if useful, record a sentence if you feel like it, leave. A weekly reflection can help reconnect the records without turning each day into a form to finish.

## Mobile Readiness

| Area | Status |
| --- | --- |
| Single-column phone layout and bottom navigation | Implemented; local Chromium layouts inspected |
| Main editor and daily-entry regression scenarios | Previously passed; see PROGRESS.md |
| Current populated board fits 320/390/768/1440px without page overflow | Passed this review |
| Card options overlay | All options visible in the inspected 390px Food menu; Move to board correctly disabled with only one board |
| Food readability and Fitness discoverability | Initial local fixes implemented and regression-tested; physical touch review remains pending |
| Today controls | Fixed locally: Filters is only displayed on My board, where it reveals its target |
| Add catalogue and priority/feeling labels | Simplified locally, keyboard/viewport tested; physical-phone review still needed |
| Side note to planner | Implemented locally with explicit date/board confirmation, retry and task-specific Undo; 12 synthetic browser checks |
| Planner conflict review | Whole-task comparison and persistent close control tested at 320/390/768/1440px; physical-phone review remains pending |
| Health conflict review | Explicit units, full nutrient values, no preselected version and reachable confirmation/save controls tested at 320/390/768/1440px |
| Physical iPhone/Android keyboards, focus, zoom, date pickers and safe areas | Not verified |
| Touch reordering and equivalent non-drag controls | Not verified/incomplete |
| Real phone-to-desktop sync, offline reconnection and expired sessions | Not verified; earlier tests simulate the backend |
| Live database account isolation and security policies | Release gate remains open |
| Installed/offline-launch app experience | No manifest or service-worker registration found in the inspected client |
| Availability of this updated build on your phone | Not deployed; the current loopback preview is local to the desktop and cloud-disabled |

**Do not treat the current preview as the only copy of important phone diary entries.** Existing public GitHub Pages access is separate from this local review build. `127.0.0.1` on a phone refers to the phone, not this computer.

The next release should go to HTTPS staging with synthetic accounts, then be tested on physical iOS Safari and Android Chrome. Verify typing a long diary, pausing to think, switching apps, changing boards, refreshing, editing different boards on phone and desktop, reconnecting after offline edits, and recovering from a conflicting same-field edit. Only then publish the reviewed bundle after preserving backups. Installing an icon on the home screen does not itself prove offline saving or synchronization.

## Recommended Delivery Order

1. Fix the inert Today control and consistent Filters/Settings terminology. Add a regression for visible disclosure behavior.
2. Rework Food summary and Fitness navigation, then shared touch targets and card-width-aware layouts. Verify long names, eight meals, large text, keyboard visibility and actual touch interaction.
3. Simplify the Add catalogue without changing stored types. Improve Side notes into the capture flow; confirm record identity and board isolation before conversions ship.
4. Complete staging security and real-device release checks. Preserve current exports and never seed sample cards into a personal account.
5. Extend weekly reflection and add an optional enjoyment template. Defer autonomous AI actions, social sharing, streak systems and more measurement cards.

No arbitrary readiness percentage is assigned. The table above distinguishes implemented, observed and unverified work; that is more useful than calling the platform "95% done" while a release-critical sync test remains open.

## Design Basis

Aim for roughly 44px primary touch targets while keeping visible icons compact. The WCAG enhanced criterion uses 44 by 44 CSS pixels; the AA minimum uses 24 by 24 with spacing and other exceptions. Raw element dimensions alone are insufficient to certify compliance. [W3C enhanced targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), [W3C minimum targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Familiar names, nearby visible labels and clear feedback reduce interpretation and memory demands. That supports the proposed catalogue and label changes; it does not prove that this specific design has passed user testing. [W3C clear labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/), [W3C forms guidance](https://www.w3.org/WAI/tutorials/forms/).

An installable PWA needs appropriate app metadata and serving conditions. Installation and offline behavior are separate concerns; a manifest is not a sync or data-safety mechanism. [MDN installable PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Evidence

- [Desktop board](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/board-desktop.png)
- [Phone board](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/board-mobile.png)
- [Phone Today](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/today-mobile.png)
- [Phone Diary](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/diary-mobile.png)
- [Phone card menu](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/food-menu-mobile.png)
- [Machine-readable inspection](/Users/austinwong/.codex/visualizations/2026/05/04/019df37d-8d8e-7832-9289-54a1194a2584/life-os-usability-20260908/inspection.json)

Screenshots contain disposable sample data, not personal records. They show Chromium-rendered layouts, not photographs of a physical phone. Early screenshot attempts needed viewport/scroll settling; the final inspection completed with no page errors. This audit did not investigate every legacy card, assistive technology or live service configuration.
