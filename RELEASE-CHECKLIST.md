# Safe Review and Release

## Review This Version

Open [the local review build](http://127.0.0.1:5180/?preview=1) while the local preview server is running. This mode disables cloud access. It is not the published website and does not display your live cloud records automatically. Port 5174 was already serving another app, so this review uses 5180 without stopping that app.

The project source is `/Users/austinwong/Documents/Codex/2026-05-04/life-os`.

## Before Publishing

1. In the current live Life OS, download the readable archive and the JSON restore backup. Store them somewhere outside this browser. Keep them private.
2. Close old Life OS tabs on every device before switching versions. Old tabs do not know about the new task-ID format or saving protocol. No new frontend can make an already-running old client obey a new protocol.
3. Open the Life OS project in Supabase. Choose **SQL Editor**, then **New query**.
4. Open `security/inspect-database.sql`, copy that file's query into the editor, and click **Run**. It only reads configuration; it does not read diary content or modify data.
5. Review the output for enabled RLS, owner-only read/insert/update rules, no permissive public policy, one row per owner, and a reliable update revision. Do not guess the configuration from a successful sign-in. Share the configuration results for review, not passwords, tokens, diary exports or secret API keys.
6. Test the new build and policies on staging with two test accounts and a real phone. Confirm that conflict warnings and restoration work. For text conflicts, review both versions, combine a draft, reload, save the choice and verify the other board is unchanged. Also verify a newer edit made during review is not overwritten. Keep production unchanged until this passes.
7. Include **all** client files in a release: `index.html`, `styles.css`, `experience.css`, `app.js`, `planner-store.js`, `state-merge.js`, `device-store.js`, `restore-review.js`, `note-actions.js`, `experience.js`, and `dev-redirect.js`. The old four-file upload is no longer sufficient. The local development server must also allow every new public module; a missing script can prevent initialization.
8. Run the regression workflow and verify the deployed URL after publishing. The new workflow runs tests; it does not itself prevent a separately configured GitHub Pages branch deployment from publishing before tests finish.
9. Open the site on one device first, sign in with the existing Life OS account, confirm the board/record counts and several older diary entries, then open the second device. Do not create a second account to access the same records.

## Local Regression Commands

With the preview server running (`npm start`), run `npm test`, `npm run test:browser`, `npm run test:sync`, `npm run test:features`, `npm run test:usability`, `npm run test:catalogue`, `npm run test:capture`, `npm run test:planner-review`, `npm run test:health-review`, `npm run test:responsive`, `npm run test:conflicts`, and `npm run test:restore`. The conflict and restore suites include failed storage writes, stale comparisons, long combined drafts, multi-tab review, narrow screens, literal rendering of markup and an actual backup download/import/reload. The usability suite checks Filters, health-card widths, eight meals, live pace, retained records and visible menus. The catalogue suite checks all existing types, metadata-update preservation, empty lists, keyboard operation and diary feeling changes during writing. Capture checks cover original-note preservation, task creation/retry/Undo, separate-board isolation, confirmation and mobile controls. Planner review checks cover complete task histories, stale choices, failed writes, archived sources, queued concurrent edits and phone layouts. Health review checks quantities/units, nutrition snapshots/totals, exercises and body measurements, other-board diaries, stale choices, failed writes and mobile comparison. Responsive checks cover Today, all card bodies, phone/tablet navigation, board selection and menu hit-testing, preserving records and unfinished input through resizing. These tests use disposable records, not your live account.

Install both test engines with `npx playwright install chromium webkit`, then additionally run `TEST_BROWSER=webkit npm run test:responsive`. The regression workflow includes both engines; its remote run remains unverified until pushed. Passing desktop WebKit does not certify physical iOS Safari.

## Phone and Portrait Drill on Staging

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
