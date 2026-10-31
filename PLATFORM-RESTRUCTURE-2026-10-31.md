# Life OS Workflow Redesign

Date: 31 October 2026. Scope: product structure, daily use, training entry, property operations, mobile access and preservation of existing records.

## Decision

Revamp the workflows and presentation, but do not replace the database or rewrite the saving system in one operation. The product currently asks its owner to navigate a collection of tools rather than complete a few familiar daily actions. Properties still carries the navigation and terminology of a separate application. More cosmetic cards will not solve that.

Keep the flexible board as a secondary view. Make Today, Plan and Health the daily entrance; keep records, money and property operations as clearly named workspaces; use Progress for measured outcomes and weekly reflection. One record must appear in multiple useful views without being copied into multiple competing stores.

This is a staged redesign, not a claim that every feature has been rebuilt or that the product is finished.

## Ten Design Challenges

These are ten distinct design reviews and counterarguments, not ten user studies or independent expert evaluations.

| Review | Challenge | Decision and acceptance condition |
| --- | --- | --- |
| 1. Daily starting point | Would a bigger dashboard actually increase follow-through? | No. Start with up to three chosen next actions, today's scheduled activities and one quick capture. Existing Today already supports this; resist adding more counters above the actual work. Test whether a task can be started without visiting the board. |
| 2. Navigation | Should every feature have equal prominence? | No. Desktop groups actions by purpose. Phone navigation is Today, Plan, Health and More. Boards, records, property tools, money and reports remain accessible rather than deleted. Test the complete destination list at compact and portrait widths. |
| 3. Property structure | Is hiding tools a substitute for reorganizing them? | Not by itself. Make Today, Calendar, Bookings and Finance primary. Put Documents, Messages, Tax and Settings under More; keep guest records within Bookings. Next, organize each booking around its stay, payments, documents and communication instead of duplicating entry screens. |
| 4. Embedded property app | Should the iframe be removed immediately? | Not before parity. Its owner-scoped cache, account bridge and clean-tab handoff currently protect unfinished property work. Retain that boundary while simplifying navigation and styles. A later native Life OS view must prove equal booking/payment/document preservation before replacement. |
| 5. Training entry | Is an aggregate exercise row a proper set-by-set gym log? | No. The current record stores sets, a reps value/range, load and RPE per exercise. Improve access and show the previous same exercise now. Next add explicit actual set rows, completed-set ticks, optional rest timing and separate planned targets, with old aggregate records preserved and clearly labelled. Do not claim that this first pass already implements that model. |
| 6. Progress truth | Would a single fitness or life score be motivating? | It would be misleading without a defensible definition. Show recorded activity, a selected lift's history, and actual key-result measures. Keep missing information distinct from zero. Opening a workout part is not proof that training was completed; this pass labels its summary days with workout entries. |
| 7. Motivation and habits | Should success require a perfect daily streak? | No. Prefer chosen weekly targets, recent consistency and an easy return after a gap. Keep rest days and unreported days separate. Add a small next action when work stalls, not a larger wall of overdue counters. Weekly reflection already exists and should be reused. |
| 8. App and mobility | Is a separate native app necessary first? | No. Begin with a standalone-installable web app using the same HTTPS service and account. Installation and offline operation are different requirements. Do not add a service worker that can cache stale app code or private API responses without a versioned recovery/update design. Test real iOS/Android keyboards and installation separately from browser simulation. |
| 9. Data architecture | Should personal boards, properties and money all be put in a new universal object? | No. Preserve existing ownership and domain boundaries. Health is a projection over the same fitness/food cards, Money remains its ledger, and Properties retains its separate protected records. Introduce smaller per-record persistence incrementally, with dual-read comparison, backups and rollback before changing existing writers. |
| 10. Visual and interaction debt | Can another CSS override make the whole platform coherent? | Not reliably. Large legacy stylesheets contain overlapping layout rules. Scope new surfaces, use the established colour tokens and native controls, avoid oversized headings, and verify screenshots and actual target bounds. Move toward shared components domain by domain; do not stack speculative global overrides. |

## Structure To Use

| Area | Primary job | What belongs here |
| --- | --- | --- |
| Today | Choose and finish the next useful action | Selected next steps, today's activities, brief writing and a lighter-day mode |
| Plan | Organize commitments | Canonical tasks, subtasks, areas, dates, waiting/parked work and calendar |
| Health | Record while doing the activity | Workout, Food and Training history, using existing saved cards |
| Your spaces | Manage specialist information | My board, Records, Money and Properties |
| Progress | Compare outcomes with chosen targets | Existing priorities, measured key results, check-ins and weekly review |
| Settings and safety | Occasional setup and recovery | Account, colours, installation, export, recovery and saving/version details |

Do not add separate habit, goal, reminder, workout and task cards that all ask for the same completion tick. Keep the record in its original domain and reference it where useful.

## Properties

The daily surface should answer: Who is arriving? Who is staying? Who is leaving? Which payment or refund needs action? The calendar should answer availability; a booking should own its payment/document/message context. Finance should distinguish received cash, outstanding amounts and accommodation revenue rather than presenting them as interchangeable totals.

The first increment reduces eight peer navigation buttons to four primary buttons and a More menu. It retains the actual original controls and handlers, not replacement buttons with independent copies of records. The menu has keyboard dismissal, focus return and a current-section label. Calendar-sync health, account locking, document identifiers, payment-ledger history, original migration copies and disabled AI tools remain in place.

Remaining property work is substantial: simplify booking entry into stay/contact/payment groups, provide an operational arrival/departure agenda, make open balances directly actionable, reduce repeated month and status controls, and place advanced tax/setup/import tools further from everyday booking work. A full visual redesign of those forms and reports is not completed by this navigation increment.

### Follow-up: Booking Capture

The first release, `030542bb76c3a8b7`, passed all hosted gates and was verified against every one of its 70 live public files, including the canonical root and app manifest. This check made no private requests and wrote no records.

The next increment simplifies the booking editor into Stay, Guest and Payment. All 19 original form fields remain. Optional contact details, deposit controls and booking options use disclosures; meaningful existing values open their relevant sections automatically. Collapsed summaries retain deposit amount/status and booking status. Total received is explicitly labelled as including any deposit, matching the existing accounting model rather than introducing another calculation. Header, close, Cancel and Save stay outside the single scrolling body, with 44px controls and phone-sized inputs.

Native constraints still block saving. Invalid fields inside folded sections are revealed before focus/error reporting; WebKit gets a layout frame before that focus. A late validation callback cannot affect a newly opened booking. Opening another booking clears only the transient pasted-email importer and its feedback, not saved guest data. Free-text incident notes preserve indentation, complete lines and trailing whitespace when saving; the old blanket trim is removed. Cancellation and resizing do not save or rewrite booking records.

Forty synthetic Properties cases pass in each browser engine, covering the new capture flow as well as existing bookings, payments, document identities, shared-session failures, multi-tab handoff and account locking. The new cases include short 320px/390px phone layouts, collapsed-field preservation, malformed email, missing received amount, negative deposit, precise decimals, manual nights, duplicate prevention and import-draft isolation. Hosted release gates and live file verification remain required for publication. No database, cache ownership, authentication, calendar job, payment arithmetic or migration-copy changes are part of this increment. Physical phone keyboard testing remains outstanding.

## Training And Nutrition

The dedicated Health view reuses the same Fitness Log and Food Tracker cards. It does not create a second workout history, food library, target table or duplicate report source. Workout and Food remember their source selections independently, including boards with multiple logs. Empty views open the requested card type without discarding an unfinished composer draft. Phone inputs use roomier rows and native numeric/date controls. The previous-performance hint uses an earlier dated entry from the same card, muscle part and exact normalized exercise name; ambiguous matches are not guessed. History opens the original dated log. The workout-part chooser retains its open state and keyboard focus during background redraws.

The review also reproduced a correctness bug: strength inputs and removal used an exercise's array position. An open editor could target another exercise after the underlying list was reordered. They now resolve the original exercise ID within the original board, source, day and workout part; missing, duplicate, archived or wrong-board targets are refused. A separate textarea sizing bug omitted CSS borders, allowing delayed resizing to move an exercise control after it had been reached. Auto-sizing now accounts for both CSS box models and skips detached or hidden fields. Both fixes have dedicated synthetic regression coverage.

Next training increment: actual sets with their own identities and done state, load/reps per set, optional RPE, notes, and a clear difference between templates and performed work. Reuse the last routine without copying last session's completed flags. Preserve original aggregate records unchanged. Update reports, readable exports, merge/conflict inspection and old-client compatibility together before enabling the new set model.

For progress, show comparable evidence: load and reps for the same movement, logged training days, distance/duration for cardio, and user-chosen consistency targets. Do not equate more load or volume with better health or claim estimated energy expenditure is measured. Keep body metrics optional and secondary to recording the workout.

Nutrition should stay meal-first: choose a meal, add a familiar food, enter a clearly stated quantity/unit, then collapse the details. Keep the saved monthly targets and snapshot nutrition values. Do not silently update old meals when a library food changes.

## App Access And Privacy

The first increment adds a web-app manifest, locally generated PNG icons based on the existing Life OS mark, standalone display metadata and an installation entry in Settings. It adds no third-party app service and no service-worker cache. The release builder preserves binary assets and continues checking the complete JavaScript bundle and embedded styles before opening saved records.

On iPhone/iPad use Safari's Add to Home Screen and Open as Web App when offered. On supported Android/desktop browsers use Install app. On recent macOS Safari use File, Add to Dock. A new installation can have separate storage and may need sign-in to the same Life OS account. First confirm the latest records are saved to cloud. Installation does not copy local unsynced records or merge a preview automatically. See [Apple iPhone instructions](https://support.apple.com/en-eg/guide/iphone/iphea86e5236/ios), [Apple Mac instructions](https://support.apple.com/en-us/104996) and [web.dev installation](https://web.dev/learn/pwa/installation).

Opening this version and cloud synchronization require a connection. Background saving after the app is closed, native store distribution, push reminders and offline app-shell access are not implemented by the installation metadata. Existing server-side property calendar jobs are a separate mechanism and are not changed here.

## Practical Routine

Morning: choose one essential next step and, optionally, two additional actions in Today. Check the day's scheduled activities. During training, open Health directly, use previous performance for reference and record the actual values. At day's end, tick what was done and write one sentence. Once weekly, use the existing review to inspect unfinished work and actual priority measures, then choose the next week's commitments.

This routine is a design recommendation, not evidence that the application can guarantee task completion. Measure whether recording becomes easier before introducing more reminders or gamification.

## Delivery And Acceptance

| Work | State |
| --- | --- |
| Simplified Properties navigation and retained original tools | Implemented; included in the complete 40-case synthetic suite in Chromium and WebKit |
| Simplified booking capture, preserved optional fields and reachable actions | Implemented; 40 Properties cases pass per engine; hosted gates and live verification required before release |
| Health workspace sharing existing workout/food sources | Implemented; nine dedicated browser workflows cover navigation, writing, multiple sources, empty views and target integrity |
| Previous exercise reference and original dated history | Implemented; tested with synthetic records |
| Stable-ID strength editing/removal and correctly sized textareas | Implemented; reordered, ambiguous and wrong-board targets plus delayed scroll/box-model regressions tested |
| Direct mobile Health entry, active-part shortcuts and roomier numeric inputs | Implemented; phone, tablet, portrait and desktop screenshots inspected |
| Standalone installation metadata and guidance | Implemented; manifest/icon checks pass; physical-device installation is not certified |
| Full native property form/report redesign | Next increment, not complete |
| Actual set-by-set workout model and reporting | Next increment, not complete |
| Habit targets and optional gentle follow-up | Design backlog; reuse existing weekly records before adding another store |
| Incremental record persistence and smaller domain modules | Architectural backlog; must not be enabled as an unverified migration |
| Offline shell and push notifications | Not enabled |
| Publication policy | Full hosted gates must pass before deployment; all public served files must match the accepted artifact |

Acceptance must include both Chromium and WebKit; phone, tablet, portrait and wide desktop screenshots; keyboard/menu focus; multi-digit entry without lost focus; existing diary/notes/other-board preservation; payment/document identity and history; stale-write refusal; and complete public release fingerprints after deployment. A physical phone, its on-screen keyboard, installation and actual signed-in cross-device operation remain separate acceptance steps.

Verification includes 464 unit checks, 40 Properties cases per engine, nine dedicated Health workflows per engine, seven existing fitness/food interface cases per engine, thirteen exercise-reuse/sizing cases per engine, eleven guarded-startup cases per engine, four design cases and three shell/navigation cases. Full hosted gates must accept the final source revision before it can deploy; an earlier candidate correctly stopped on the delayed textarea-sizing regression rather than publishing it. Chromium parsed the manifest without errors and returned no installability errors. Browser cases use disposable records and mocked private requests, not production accounts. These results do not certify physical-device installation or live signed-in cross-device operation.

## Research Basis

These sources inform the design choices; none proves that a particular redesign will improve this owner's adherence without observing actual use.

1. [Nielsen Norman Group: Ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) - status visibility, recognition, consistent controls and recovery.
2. [Nielsen Norman Group: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) - defer occasional tools without removing them.
3. [Android: Layouts and navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) - compact navigation with three to five primary destinations and secondary tabs for related views.
4. [Android: Responsive navigation](https://developer.android.com/develop/ui/views/layout/build-responsive-navigation) - adapt navigation to available space rather than shrinking the desktop interface.
5. [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) - minimum targets/spacing; use larger 44px controls for important phone actions here.
6. [W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) - fixed navigation must not hide focused controls.
7. [Hevy: Previous workout values](https://www.hevyapp.com/features/track-exercises/) - a prior exercise reference reduces remembering/retyping effort.
8. [Hevy: Saving workouts](https://www.hevyapp.com/features/workout-log/) - distinguish session capture, completion and reusable routine updates.
9. [Hospitable: Calendar overview](https://help.hospitable.com/en/articles/5625442-getting-started-with-the-calendar-overview) - organize property activity around reservations and availability with clear property selection.
10. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) - installation requirements and standalone launch.
11. [MDN: Web application manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest) - explicit identity, scope, start URL and icons.
12. [web.dev: Installation](https://web.dev/learn/pwa/installation) - browser/platform differences and isolated installation storage.
13. [Apple: iPhone web apps](https://support.apple.com/en-eg/guide/iphone/iphea86e5236/ios) - current phone installation actions.
14. [Apple: Safari web apps on Mac](https://support.apple.com/en-us/104996) - desktop installation rather than requiring a separate native build.
