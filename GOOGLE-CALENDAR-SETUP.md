# Google Calendar: Connection Plan

Status: 10 September 2026. Live Google synchronization is **not configured** in this release. Life OS Calendar works independently. Its **Add to Google Calendar** action opens a prefilled Google event for your review. Saving it creates a separate copy. Editing either copy does not update the other, and repeating the action may create another event.

## Prepare Your Google Project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or choose a project you control for Life OS.
2. Enable **Google Calendar API** in that project.
3. In Google Auth Platform, configure the app name, support email, audience and contact information. While testing, add your own Google account as a test user. Public availability may require verification for the selected permissions.
4. Create an OAuth client of type **Web application**. Keep its client secret out of GitHub, Life OS HTML/JavaScript, browser storage and chat. The client ID is not a secret, but by itself does not connect the app.
5. Stop before entering a callback URL: the authenticated server callback must first be implemented and deployed. Register its exact HTTPS URL after that. Do not use the GitHub Pages homepage or an invented localhost address as a server callback.

These are preparation steps, not instructions that enable the connection today. Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) describes the authorization-code exchange and server-side token handling required for persistent access.

## Implementation Required Next

- Use an authenticated backend, such as a Supabase Edge Function, for the OAuth callback and token exchange. Validate the Life OS user, bind single-use OAuth state to that user, and prevent replay and account substitution. Use PKCE where supported.
- Store the Google client secret and encryption key only in server secrets. Encrypt refresh tokens in a server-only store; never include them in the ordinary board payload, backups or client-readable database rows. Avoid logging authorization codes or tokens.
- First request `calendar.calendarlist.readonly` and `calendar.events.readonly`. Let the user choose which calendars to display. These scopes can read more calendars than the display selection; explain that distinction in consent. Avoid the broad permission to edit, share or delete every calendar. For later writes, prefer an app-created Life OS calendar using `calendar.app.created`. See Google's [scope definitions](https://developers.google.com/workspace/calendar/api/auth).
- Keep imported Google events separate from locally authored activities, keyed by provider, calendar ID and event ID. A calendar selection belongs to the authenticated account; explicitly choose the board that displays it. Never identify events by matching titles.
- Perform an initial paginated load, then incremental synchronization. Commit the new sync token only after every page succeeds. Handle cancelled events and invalid tokens. An HTTP 410 rebuilds only the Google event cache, never local activities, tasks or diaries. Follow Google's [incremental synchronization guide](https://developers.google.com/workspace/calendar/api/guides/sync).
- Provide disconnect/revoke controls, permission-denied and expired-session states, last-successful-sync time, and a clear offline indicator. Imported read-only events must not display local edit/delete controls.

## Release Checks Before Connecting Real Records

Test two accounts and two boards for isolation; phone and desktop simultaneously; token expiry and revocation; all-day and multi-day events; recurrence exceptions and cancellation; daylight-saving transitions; failed pagination and retries; duplicate event prevention; stale edits; and recoverable failures. Do not claim two-way sync until those paths pass against a test calendar.

No Anthropic key is needed for this calendar integration. Do not publish a private calendar or use a public calendar embed to bypass authorization.
