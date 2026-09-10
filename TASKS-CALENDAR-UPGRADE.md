# Tasks and Calendar Upgrade

Release candidate: 10 September 2026. Built on `27af3d5`.

## Delivered

- Tasks and Calendar are full-width board views alongside My board and Today, not new copies of the board's records.
- Task areas: Culturely, MascotRun, Sunrise Villa, Lovely Paradise, Fitness, Personal, plus Unsorted and existing areas. Filter by area or search task names, projects and notes.
- Quick task capture remembers the last area in this tab and board. Planned date is optional; an undated task does not become overdue. An explicit date-clear control supports Safari's native date inputs.
- Today, Upcoming, All tasks and Completed views. Today retains past-day navigation and late-completion history. Completed tasks retain their completion date and full recorded timestamp.
- Task editing includes area, project, To do/Doing/Waiting status, optional deadline, priority and multiline notes. The checkbox controls completion. Three-dot actions retain edit, archive and confirmed deletion.
- Task IDs remain canonical. Existing planner cards and the new Tasks view read the same records, including archived planner source cards. Existing independent To-Do/Project checklists are not silently converted or deleted.
- Calendar offers month, week and agenda views, with agenda as the initial phone preference. Record timed, overnight, all-day and multi-day activities, areas, locations, meeting links and notes. All-day end dates are inclusive in Life OS.
- Calendar activities are stored as board-owned event records and excluded from the visual card layout. Dragging cards and saving layouts retain those records. Existing countdown/event cards also appear on the calendar.
- Activities can be edited, archived and restored through Archive. Activity conflicts keep whole versions and require explicit review, including a recovery copy before applying a choice.
- New task/activity drafts survive a pause, view changes and reload in the same browser tab. Drafts are tab-local until submitted, not cloud-saved records. Do not close a tab with an unfinished draft. The app's save indicator continues to report saved records, not an unsubmitted form.
- Readable data downloads include task areas, projects, notes and deadlines, plus activity timing, location, notes and meeting links. JSON backups retain the structured fields.
- Failed device writes leave the task/activity capture form or task editor open with its text. Retrying capture reuses its pending record ID instead of creating a duplicate.
- Opening a task editor cannot move focus away from a field already selected by the user. A deterministic delayed-frame test covers the cursor race found by remote verification.

## Data Boundaries

No database migration, direct Supabase data write, production fixture, destructive cleanup or historical title-based merging is part of this upgrade. Existing diaries and stored boards are not replaced. New fields are additive, and the existing write-ahead saving, board isolation and conflict recovery remain in use.

Tests use synthetic records in disposable browser profiles with external database requests blocked. They verify application behavior, not the current production database's policies or unresolved user conflicts. A previous live "Changes need review" state must still be reviewed explicitly; this release does not choose a cloud version on the user's behalf.

## Not Yet Included

- Live Google import, background sync or two-way editing. The current Google action creates a separate event only. See [Google Calendar setup](GOOGLE-CALENDAR-SETUP.md).
- Task subtasks, recurring task rules, linked activity-preparation tasks, cross-board task aggregation, and a dedicated project entity. The project field is currently a lightweight label.
- An automatic migration of independent legacy To-Do/Project card items into canonical tasks. That needs a separate reviewed conversion with identity and completion-history tests.
- A guarantee of zero future errors, live database security certification or authenticated phone-to-computer sync verification.

## Verification

The release gate is the complete regression workflow plus the new planning suite in Chromium and WebKit. New checks cover undated capture, valid dates, metadata retention, historical/late completion, multi-day events, safe links, drafts, layout preservation, board isolation, stale edits, readable exports and explicit activity conflict review.

Screenshots are generated at 320, 390, 768 and 1080 CSS pixels, including portrait desktop. They are synthetic examples, never a copy of personal diary data. Test source is in `tests/planning.cjs` and `tests/planning.test.cjs`.
