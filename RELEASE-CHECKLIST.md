# Safe Review and Release

## October 11 Candidate

Build `2026.10.11-follow-through`, candidate release `ea31e6d663383a97`. GitHub Pages **Source: GitHub Actions** was visibly saved on 11 October; the existing website remains available until a verified replacement is deployed. The first remote test/deploy and live asset hashes still require confirmation. No Supabase migration is required for the additive task and next-step metadata.

Run `npm run test:follow-through` in both engines. It covers original-card completion dates, unknown legacy dates, late completion and exact Undo, reopening history, failed saves/retry, retained daily plan drafts, original-choice denominators, task/activity agenda, explicit checkpoints, overdue check-in visibility, four-destination phone layout, unresolved comparison exclusion and readable history exports. The timer must not dismiss an error or reopen a task already completed elsewhere.

## Review This Version

Open [the local review build](http://127.0.0.1:5180/?preview=1) while the local preview server is running. This mode disables cloud access and uses separate preview records, drafts, recovery copies and save queues. It is not the published website and does not display normal local/cloud records automatically. Existing records remain in [the normal local workspace](http://127.0.0.1:5180/), at the same origin without the preview flag. Normal local storage at this address is also separate from storage at the GitHub Pages origin. There is no automatic cross-origin data transfer. Port 5174 was already serving another app, so this review uses 5180 without stopping that app.

Before this isolation upgrade, preview shared the normal storage keys. This upgrade does not guess which old records came from previews, move them or clear them. Save or download unfinished writing before reloading older preview tabs; a new build cannot change the behavior of already-running old code. Old saved tab-local drafts remain accessible under normal mode in the same tab. Do not close a tab containing unsaved writing. Preview and normal storage still share the browser origin's quota and are not encrypted. Use a separate profile or staging origin for large/destructive tests, and never seed tests into a personal browser profile.

The project source is `/Users/austinwong/Documents/Codex/2026-05-04/life-os`.

## Before Publishing

1. In the current live Life OS, download the readable archive and the JSON restore backup. Store them somewhere outside this browser. Keep them private.
2. Close old Life OS tabs on every device before switching versions. Old tabs do not know about the new task-ID format or saving protocol. No new frontend can make an already-running old client obey a new protocol.
3. Open the Life OS project in Supabase. Choose **SQL Editor**, then **New query**.
4. Open `security/inspect-database.sql`, copy that file's query into the editor, and click **Run**. It only reads configuration; it does not read diary content or modify data.
5. Review the output for enabled RLS, owner-only read/insert/update rules, no permissive public policy, one row per owner, and a reliable update revision. Do not guess the configuration from a successful sign-in. Share the configuration results for review, not passwords, tokens, diary exports or secret API keys.
6. Test the new build and policies on staging with two test accounts and a real phone. Confirm that conflict warnings and restoration work. For text conflicts, review both versions, combine a draft, reload, save the choice and verify the other board is unchanged. Also verify a newer edit made during review is not overwritten. Keep production unchanged until this passes.
7. Build the allowlisted release with `npm run build`. `release-files.json` is the single public-file list used by the builder and preview server, including coaching and daily-workspace modules. Missing startup assets fail the build. `dist/` contains only these assets plus `release.json`, with a deterministic release ID, file hashes and matching cache versions. Do not upload the repository root, private exports, diagnostic fixtures, SQL or credentials. Output must be empty; for a separate local build use a new directory, for example `node build-release.cjs /private/tmp/life-os-release-review`.
8. Enable **Settings > Pages > Build and deployment > Source: GitHub Actions** in the repository before relying on the release gate. The checked-in workflow builds once, runs unit and browser tests against that artifact, then deploys that same artifact on a successful `main` push. A newer run cancels an outdated run for the same ref. This does not automatically change a repository still configured for branch-based Pages publishing. The configuration and first remote run must be verified; adding the workflow locally does not publish anything. See [GitHub's custom workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
9. Open the site on one device first, sign in with the existing Life OS account, confirm the board/record counts and several older diary entries, then open the second device. Do not create a second account to access the same records.

## Local Regression Commands

With the preview server running (`npm start`), run `npm test`, `npm run test:browser`, `npm run test:sync`, `npm run test:features`, `npm run test:usability`, `npm run test:catalogue`, `npm run test:capture`, `npm run test:planner-review`, `npm run test:health-review`, `npm run test:responsive`, `npm run test:conflicts`, and `npm run test:restore`. The conflict and restore suites include failed storage writes, stale comparisons, long combined drafts, multi-tab review, narrow screens, literal rendering of markup and an actual backup download/import/reload. The usability suite checks Filters, health-card widths, eight meals, live pace, retained records and visible menus. The catalogue suite checks all existing types, metadata-update preservation, empty lists, keyboard operation and diary feeling changes during writing. Capture checks cover original-note preservation, task creation/retry/Undo, separate-board isolation, confirmation and mobile controls. Planner review checks cover complete task histories, stale choices, failed writes, archived sources, queued concurrent edits and phone layouts. Health review checks quantities/units, nutrition snapshots/totals, exercises and body measurements, other-board diaries, stale choices, failed writes and mobile comparison. Responsive checks cover Today, all card bodies, phone/tablet navigation, board selection and menu hit-testing, preserving records and unfinished input through resizing. These tests use disposable records, not your live account.

Also run `npm run test:planning`, `npm run test:coaching`, `npm run test:daily`, and `npm run test:refinements`. Install both test engines with `npx playwright install chromium webkit`, then repeat the responsive, planning, coaching, daily and refinements suites with `TEST_BROWSER=webkit`. Refinements cover modal focus, conflicting nutrition targets, week labels and retained mobile writing. The regression workflow includes both engines; each new release must verify its own exact commit. Passing desktop WebKit does not certify physical iOS Safari.

To test the built artifact locally, start `LIFE_OS_SERVE_RELEASE=1 PORT=5181 npm start` on a free port and set `TEST_URL=http://127.0.0.1:5181/` on browser test commands. For a fresh build outside `dist/`, set `LIFE_OS_RELEASE_DIR` to that output directory as well; the server still serves only the public allowlist. CI uses built-artifact mode on its default port. Build tests check missing modules, source symlinks, reproducible IDs and refusal to overwrite a nonempty directory.

After a real deployment, compare the live `release.json` ID and each downloaded asset hash with the tested artifact. Confirm that index startup URLs use that ID and the site's Saving & version shows the intended application build. Then verify existing records using the read-only checks below. Do not solve a version mismatch by forcing a cloud upload.

Run `npm run test:task-sources` in Chromium and with `TEST_BROWSER=webkit`. This covers board/card/item identity, source edits, independent tabs/boards, retained drafts, failed-save retry and Undo, archive/restore, old ID-less checklist preservation and phone/portrait controls. All tasks and Completed include legacy one-off card records. New source-card completion dates enter Today/review totals; unknown older completion dates and undated planned dates are not inferred. Calendar still uses explicitly dated canonical Planner tasks and activities. No automatic conversion is part of this release.

Run `npm run test:preview-isolation` in Chromium and with `TEST_BROWSER=webkit`. It checks normal-record preservation, isolated recovery/restore/export, pending-write replay, editor drafts, credentials and low-level cloud blocking, locks, failed saves and same-mode multi-tab merging. A mocked normal cloud save must contain no preview records. Unit checks keep normal keys/locks byte-compatible with the previous build.

## Phone and Portrait Drill on Staging

Run `npm run test:design` in Chromium and with `TEST_BROWSER=webkit` before the physical-device drill. The visual suite uses synthetic records and checks Board, Today, Tasks, Calendar and Priorities at five widths, selected mobile navigation, retained writing and three actual task columns at 1055/1079/1080 pixels. Its Today meter describes only the currently visible chosen steps; it must not be interpreted as overall life or programme progress.

1. Deploy this complete build to an accessible HTTPS staging URL. A phone's `127.0.0.1` refers to the phone, not this computer. Do not expose the development server or use personal diary records for the drill.
2. Use a test account and test boards. On the portrait desktop, compare My board and Today at normal zoom and increased zoom. Switch two/three-column preferences, resize the window, then return to the original size and check manual placements.
3. On iOS Safari and Android Chrome, write several diary paragraphs, pause with the keyboard open, switch focus, rotate, close/reopen the keyboard, and reload after saving. Confirm full text and newlines remain. Repeat with Quick notes and Planner input.
4. Use long board names and enough boards to scroll the chooser. Open each card menu near the bottom of the viewport. Confirm Edit, Move, Archive and Remove remain reachable above the navigation and keyboard. Test Undo/restore using disposable entries.
5. Sign into the same test account on phone and desktop, using different boards. Edit, sync and reload both. Verify the full records and original card positions. Exercise offline/reconnect and a deliberate conflict. Do not publish as phone-ready until these real-device checks pass.

## Health Conflict Drill on Staging

1. Use the same test account on two devices and the updated build on both. Log 100 g of one test food, then let both devices sync.
2. Disconnect both devices. On one, change that item to 200 g. On the other, change it to 1 serving. Reconnect and save. Confirm that a conflict pauses upload, with complete recorded versions, never 200 servings.
3. Open Recovery, compare the amount, serving basis and all nutrient values. Choose and confirm one version. Verify meal/day totals after reload on both devices and that an unrelated diary on another board remains unchanged.
4. Repeat for a strength exercise's name versus weight and running distance versus duration. Check body measurements, food-library serving basis and a monthly target. Changes to separate foods, exercises, days or boards should merge independently.
5. While a comparison is open, edit that entry again on the other device. The older choice must not overwrite the newer remote edit; a new comparison must remain available. Confirm that blocked backup storage prevents applying a choice.

These are release gates, not claims that the staging drills have been run. Old mixed records, moved-card conflicts and hard-deleted records still require individual recovery review.

## Restore Drill on Staging

1. Download a JSON restore backup and a readable archive containing only test records.
2. Make a recognizable local change. Import the JSON file and inspect the board comparison; cancel first and verify nothing changed.
3. Import again, confirm replacement and verify the pre-change records are in Recovery. Reload and check diary text, completed tasks, food entries and fitness history.
4. Open another tab. Edit a separate board and confirm it saves locally without uploading the restored copy automatically. Sign-in alone must not resume syncing.
5. Choose **Save cloud**, review its confirmation and any conflicting text, then verify the test records from a second device. Alternatively, choose **Load cloud** to return to the existing cloud copy.
6. Do not use a production diary to test failure or deletion. Supplementary recovery snapshots inside an imported file are not automatically merged into the active boards.

## Planner Conflict Drill on Staging

1. In two test devices sharing one test account, start from the same planner task and synchronized baseline.
2. Complete the task on one device; reschedule it on the other before syncing. Verify saving pauses for a comparison instead of combining completion and the other schedule.
3. In Recovery, inspect dates, status and recorded times. Select and confirm a version. Verify only that task changes and a pre-choice recovery copy exists.
4. Repeat with removal versus completion. A removed record must remain recoverable, not be permanently erased by the review.
5. Change the task on the first device while the second has a comparison open. Saving the older choice must not silently overwrite the newer server version; a fresh comparison is required.
6. Check selected-day completion history, duplicate-name tasks and a separate board after each scenario. Do not use important personal tasks for this drill.

## Remaining Security Work

- Prove owner isolation with separate test users, including read, insert, update and delete. The source code alone cannot prove the active database policy.
- Verify HTTP security headers on the actual host. GitHub Pages is not automatically configured by a local `_headers` file; do not treat a meta `frame-ancestors` directive as protection.
- Consider a host that supports controlled headers and a restrictive CSP, plus account MFA, server-side version history and a tested recovery process.
- Keep access tokens out of exports and logs. Protect the GitHub/Supabase accounts as well as the app login.
- Local browser copies are readable to someone with access to the same unlocked device/browser profile. Signing out of cloud sync does not erase those copies. Full encrypted-at-rest/offline-vault support is not implemented.

There is no request for an Anthropic, Supabase secret, service-role, or database password in this review process.
