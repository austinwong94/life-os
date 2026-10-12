# Connect Google Calendar to Life OS

11 October 2026. **Prepared in source, not connected or deployed.** You confirmed that no Google project has been created. The current live release needs the new frontend published as well as the private backend deployed.

## Sync Contract

- Export dated canonical Planner tasks and structured Calendar activities from each selected board's **confirmed cloud copy** to a dedicated Google calendar. Tasks become all-day events on their original date; carryover/completion updates the same event ID. Undated To-Do/Project items and legacy countdowns are not assigned invented dates.
- Export titles, dates/times and activity locations only. Diaries, task notes, reflections, meeting URLs and health records stay out of Google.
- Deterministic event IDs, server receipts and conditional writes protect retries/edits. Existing Google-side edits or deletions pause the affected event for review.
- Bounded sync runs resume using a per-board cursor, so a large past task history cannot repeatedly block newer records. Partial runs report waiting items; a last-full-sync timestamp is not advanced for a partial scan.
- Automatic outward sync is enabled per board after reviewing it; it runs while the live website is open and waits for confirmed cloud saves. Pause/disconnect retains records and Google events.
- **Not full two-way sync.** This version does not read your primary/existing calendars or import Google changes. It does not automatically delete events when local tasks are archived, removed or moved. Retained Google events need manual review. Old manually created Google copies are not matched by title or deleted.

## Before Connecting

Download **My information** and a **JSON backup** from your existing Life OS account, and save unfinished writing. Confirm **Saved to cloud** for the actual boards. File/localhost/preview and GitHub Pages have different browser storage; connection does not transfer those records. Do not reset, load an empty copy or force-overwrite to troubleshoot.

Use a separate test Life OS account/board for the acceptance checks below before enrolling your important boards. Synthetic tests are not production OAuth/RLS proof.

## Step 1: Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/). In the project selector choose **New Project**, name it **Life OS**, and create it.
2. Open **APIs & Services > Library**. Search **Google Calendar API**, open it and click **Enable**.
3. Open **Google Auth Platform**. Complete **Branding** with app name Life OS, your support email and contact email.
4. In **Audience**, choose **External** for a personal Gmail account. While in Testing, add your own Google account as a test user.
5. In **Data Access**, add only `openid` and `https://www.googleapis.com/auth/calendar.app.created`. The first verifies account identity; the second allows app-created secondary calendars. Do not add full Calendar, Gmail or Drive access.
6. Open **Clients > Create client > Web application**. Name it **Life OS server**. No JavaScript origin is required for this backend flow.
7. Add this exact **Authorized redirect URI**:

```text
https://shrmhjulhfuodtrsqhpu.supabase.co/functions/v1/google-calendar/callback
```

8. Create the client and retain its client ID and secret securely. You may share the public client ID for configuration. **Never paste the client secret into chat, frontend code, browser storage or GitHub.**

Google documents the [web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth). External apps with Calendar access in Testing can have refresh tokens expire after seven days. Review production/verification requirements before relying on a long-lived connection; reconnection is not a Life OS data reset. [Token-expiration guidance](https://developers.google.com/identity/protocols/oauth2#expiration)

## Step 2: Private Supabase Backend

This requires ownership of your project. Enabling Supabase's Google sign-in provider alone does **not** connect Calendar.

1. In [Supabase Dashboard](https://supabase.com/dashboard), select project **shrmhjulhfuodtrsqhpu**, matching the website.
2. In **SQL Editor**, run the contents of this file once:

```text
/Users/austinwong/Documents/Codex/2026-05-04/life-os/supabase/migrations/20261011_google_calendar.sql
```

It creates two new integration tables and two service-only functions in a transaction. It contains no DROP/TRUNCATE and does not alter `user_states`, boards, users or existing policies. If a table already exists, inspect the setup instead of dropping it or repeatedly changing/rerunning SQL.

3. In **Edge Functions > Secrets**, enter `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from Google. Also enter `GOOGLE_TOKEN_ENCRYPTION_KEY`: generate a 32-byte key locally with this command, then enter its output directly into Supabase Secrets, not chat:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep the encryption key securely. Rotating it requires migrating encrypted tokens, not resetting your boards. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to functions; do not put a service-role key in the website.

4. Run these commands one at a time in Terminal:

```sh
cd /Users/austinwong/Documents/Codex/2026-05-04/life-os
npx supabase login
npx supabase link --project-ref shrmhjulhfuodtrsqhpu
npx supabase functions deploy google-calendar --no-verify-jwt
```

The callback cannot carry a Supabase JWT. The function validates `auth.getUser()` on every other action; callback access instead needs single-use expiring state and PKCE. Integration tables use RLS with no browser-role access. Tokens use AES-GCM encryption bound to the Life OS user. [Supabase function auth](https://supabase.com/docs/guides/functions/auth), [function secrets](https://supabase.com/docs/guides/functions/secrets).

5. Publish the verified frontend through the existing GitHub Actions release. Function deployment does not update GitHub Pages. Public assets must include `google-calendar.js` and `calendar-sync-core.js`; backend files/secrets are never public website assets.

## Step 3: First Connection

1. Open [live Life OS](https://austinwong94.github.io/life-os/) on HTTPS and sign in to your existing **Life OS cloud account**. File URLs, localhost and preview cannot connect Google.
2. Open **Plan > Calendar > Google Calendar > Check connection**.
3. Click **Connect Google**. Review the notice and Google's permissions, select the correct Google account and grant the two requested permissions. After returning to Life OS, check the connection again.
4. Choose your test board, wait for **Saved to cloud**, and click **Review & sync board**. Inspect every item/date before proceeding.
5. Choose **Sync & enable this board** and confirm creation of one dedicated Life OS calendar. Enable its visibility under Google Calendar's My calendars if necessary.
6. Review/enrol each real board only after the checks below pass. Never use the old **Add to Google Calendar** copy action for already-synced activities.

## Acceptance Checks

- Add a test task; sync twice. Expect one event. Rename/change date/complete: expect the same event ID, not another event.
- Desktop and phone on different boards: create distinct tasks, wait for cloud save, verify both boards and Google events after refresh.
- Change/delete an exported event in Google: Life OS must hold it for review without overwriting it or altering your local task. This release offers no force-overwrite button or automatic import.
- Check all-day multi-day and timed overnight activities, including your timezone. The final all-day date must be included.
- Interrupt an insert/update and retry: expect no duplicate and an intact Life OS record.
- A second test Life OS user must not read the first user's connection/receipts. Anonymous/authenticated REST/RPC access to new integration tables/functions must be denied. Separately verify existing `user_states` owner RLS.
- Pause/disconnect/reconnect the **same Google account**: retain calendar/mapping and avoid creating a second calendar.

## Recovery / Limits

Backend not deployed: deploy secrets/function, do not reset boards. Redirect mismatch: compare the URI exactly. Google denied access: check enabled API, test user and scope. Cloud changed: resolve Life OS saving conflicts before retrying. Expired Google access: reconnect the same account. Concurrent sync: one server lock wins; the other retries.

**Calendar creation needs review:** a request may have succeeded before its response was received. Creation is deliberately not retried automatically. An administrator must inspect the newly created Life OS calendar's exact ID and attach it to this user's integration row. Do not clear `provisioning_started_at` and blindly create another calendar.

Google-side edits remain paused for manual review. A different Google account requires a reviewed mapping migration. Moving/removing local records leaves their Google events retained, not silently deleted. Closed-app scheduled sync, reading your existing calendars, recurrence import and full two-way conflict resolution remain future work.

If disconnect reports that Google revocation could not be confirmed, automatic access in Life OS has stopped and its saved tokens are cleared; also remove Life OS in **Google Account > Third-party connections** to revoke the Google permission. Mapping receipts stay for safe reconnection to the same account.

No production database or Google calendar records were accessed/changed during development. Real connection, server permissions and two-device checks are still required.
# Release Gate

The current published frontend deliberately sets `GOOGLE_CALENDAR_SYNC_READY=false` in `google-calendar.js`. Leave it disabled until the private backend, OAuth consent and test-account acceptance below are complete. Prepared integration tests enable it only inside isolated fixtures; this does not connect the real app. Then change the flag in a reviewed frontend release. No production database deployment is part of the current task/subtask publication.

