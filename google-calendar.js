"use strict";
// Enable only after the private backend and Google consent setup pass acceptance.
const GOOGLE_CALENDAR_SYNC_READY=false;
const googleCalendarState={owner:"",status:null,busy:false,message:"",results:null};
function googleCalendarAllowed() {return GOOGLE_CALENDAR_SYNC_READY && !PREVIEW_MODE && location.origin==="https://austinwong94.github.io" && location.pathname.startsWith("/life-os/");}
async function googleCalendarRequest(action,data={}) {
  if(!GOOGLE_CALENDAR_SYNC_READY)throw new Error("Google Calendar setup is pending. No data was sent to Google.");
  if(!googleCalendarAllowed())throw new Error("Connect from the live HTTPS Life OS website, not file or preview mode.");
  const session=await ensureCloudSession();
  if(googleCalendarState.owner!==session.user.id)Object.assign(googleCalendarState,{owner:session.user.id,status:null,results:null});
  const response=await fetch(SUPABASE_CONFIG.url+"/functions/v1/google-calendar",{
    method:"POST",headers:{...getCloudHeaders(session),"Content-Type":"application/json"},
    body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(65000)
  });
  let result;try {result=await response.json();}catch {throw new Error("Google connection backend is not deployed. Follow the setup guide; your data is unchanged.");}
  if(!response.ok)throw new Error(response.status===404?"Google connection backend is not deployed yet.":result.error || "Google connection unavailable. Your records are kept.");
  return result;
}
async function googleCalendarCloudVersion(boardId) {
  if(cloudConflictPending || isRestoreSyncPaused() || corruptLocalStateDetected || state.syncConflicts?.length)throw new Error("Resolve saving conflicts or resume cloud sync first. Nothing was sent to Google.");
  if(!await flushDeviceWrites())throw new Error("Device saving needs attention before syncing Google.");
  const session=await ensureCloudSession(),row=await fetchCloudStateRow(session);
  const local={id:boardId,cards:state.activeBoardId===boardId?state.cards:state.boards.find(b=>b.id===boardId)?.cards,
    archivedCards:state.activeBoardId===boardId?getArchivedCards():state.boards.find(b=>b.id===boardId)?.archivedCards};
  const remote=row?.state?.boards?.find(b=>b.id===boardId);
  if(!remote)throw new Error("Save this board to Life OS cloud first. Google reads only your confirmed cloud copy.");
  const own=await LifeCalendarSync.collect(session.user.id,local,LifePlanner),saved=await LifeCalendarSync.collect(session.user.id,remote,LifePlanner);
  const ordered=list=>list.slice().sort((a,b)=>a.id.localeCompare(b.id));
  if(!LifeStateMerge.equal(ordered(own),ordered(saved)))throw new Error("Task or activity changes are still waiting for cloud sync. Wait for Saved to cloud, then retry.");
  return row.updated_at;
}
async function googleCalendarAction(action,expectedBoardId=state.activeBoardId) {
  if(googleCalendarState.busy)return;
  googleCalendarState.busy=true;googleCalendarState.message="";
  const boardId=state.activeBoardId;
  try {
    if(expectedBoardId!==boardId)throw new Error("The active board changed. Review its Google sync before continuing.");
    if(action==="connect") {
      if(!confirm("Connect Google to Life OS? It will request access to app-created calendars only. Diaries and notes are not shared. Continue to Google's consent screen?"))return;
      const result=await googleCalendarRequest("connect");
      const url=new URL(result.url);if(url.origin!=="https://accounts.google.com" || url.pathname!=="/o/oauth2/v2/auth")throw new Error("Unexpected authorization address. Connection stopped.");
      location.assign(url.href);return;
    }
    if(action==="disconnect") {
      if(!confirm("Disconnect Google? Your Life OS records and existing Google events will stay. Automatic Google sync will stop."))return;
      const result=await googleCalendarRequest("disconnect");googleCalendarState.results=null;
      if(!result.revoked)googleCalendarState.message="Disconnected in Life OS. Also remove Life OS from Google Account > Third-party connections to confirm Google's permission is revoked.";
    }
    if(action==="preview") {
      const cloudVersion=await googleCalendarCloudVersion(boardId),result=await googleCalendarRequest("preview",{boardId,cloudVersion});
      const dialog=dailyDialog("Review Google sync"),list=planningNode("div","google-preview-list");
      dialog.append(planningNode("p","daily-muted",`${result.count} dated tasks and activities. Titles, dates and activity locations only; no diaries, task notes or private reflections.`));
      result.items.forEach(item=>{const row=planningNode("div","google-preview-row");row.append(planningNode("strong","",item.title),planningNode("small","",item.date));list.append(row);});dialog.append(list);
      dialog.append(planningNode("p","daily-muted","Automatic sync runs while Life OS is open, after confirmed cloud saves. Google edits are held for review, not imported into your tasks."));
      const sync=planningButton("Sync & enable this board",async()=>{dialog.close();await googleCalendarAction("sync",boardId);},"refresh-cw");sync.classList.add("is-primary");dialog.append(sync);return;
    }
    if(action==="sync" || action==="pause") {
      if(action==="pause") {
        await googleCalendarRequest("pause",{boardId});googleCalendarState.status=await googleCalendarRequest("status");return;
      }
      const cloudVersion=await googleCalendarCloudVersion(boardId);
      if(action==="sync" && !googleCalendarState.status?.calendarReady) {
        if(!confirm("Create one private Life OS calendar in Google? Existing calendars will not be changed."))return;
        await googleCalendarRequest("provision",{boardId,cloudVersion});
      }
      const result=await googleCalendarRequest(action,{boardId,cloudVersion,enableAuto:action==="sync"});
      if(action==="sync")googleCalendarState.results=result;
    }
    googleCalendarState.status=await googleCalendarRequest("status");
  } catch(error) {googleCalendarState.message=error.message || "Connection failed. Existing data was kept.";}
  finally {
    googleCalendarState.busy=false;
    // Replace this status area only; never re-render unfinished text editors.
    const panel=document.querySelector(".google-calendar-panel");if(panel){const next=renderGoogleCalendarPanel();next.open=next.open || panel.open;panel.replaceWith(next);}
  }
}
function renderGoogleCalendarPanel() {
  const panel=planningNode("details","calendar-connection google-calendar-panel"),status=googleCalendarState.owner===cloudSession?.user?.id?googleCalendarState.status:null;
  panel.append(planningNode("summary","",!GOOGLE_CALENDAR_SYNC_READY?"Google Calendar - setup pending":status?.connected?"Google Calendar - connected":"Google Calendar"));
  panel.append(planningNode("p","daily-muted",PREVIEW_MODE?"Google access is disabled in preview.":!GOOGLE_CALENDAR_SYNC_READY?"Google Calendar connection is not enabled yet. Your Life OS tasks and activities remain available.":!googleCalendarAllowed()?"Open the live Life OS website to connect Google.":"Dedicated Life OS calendar. Notes and diaries stay private. Google edits pause the affected event for review."));
  const actions=planningNode("div","google-calendar-actions");
  if(googleCalendarAllowed()) {
    if(status && !status.configured)panel.append(planningNode("p","planning-message","Google backend secrets are not configured yet. Follow the setup guide."));
    actions.append(planningButton("Check connection",()=>googleCalendarAction("status"),"refresh-cw"));
    if(status?.connected) {
      actions.append(planningButton("Review & sync board",()=>googleCalendarAction("preview"),"calendar"),planningButton("Disconnect",()=>googleCalendarAction("disconnect"),"x"));
      if(status.boardIds.includes(state.activeBoardId))actions.append(planningButton("Pause this board",()=>googleCalendarAction("pause"),"pause"));
      panel.append(planningNode("small","daily-muted",status.boardIds.includes(state.activeBoardId)?"Automatic sync enabled for this board while Life OS is open.":"This board is not enrolled in automatic Google sync."));
      if(status.lastSyncAt)panel.append(planningNode("small","daily-muted","Last full sync: "+new Date(status.lastSyncAt).toLocaleString()));
    } else if(status?.configured)actions.append(planningButton("Connect Google",()=>googleCalendarAction("connect"),"external-link"));
  }
  actions.append(planningButton("Setup guide",openGoogleCalendarSetup,"settings"));panel.append(actions);
  if(googleCalendarState.message){const message=planningNode("p","planning-message",googleCalendarState.message);message.setAttribute("role","status");panel.append(message);panel.open=true;}
  if(googleCalendarState.results && status?.connected) {
    const result=googleCalendarState.results;panel.append(planningNode("p","",`${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged. ${result.remaining} waiting. ${result.retained} previous events retained.`));
    if(result.conflicts?.length){const list=planningNode("ul","google-conflicts");result.conflicts.forEach(c=>list.append(planningNode("li","",c.title+" - "+c.reason)));panel.append(list);}
    panel.open=true;
  }
  actions.querySelectorAll("button").forEach(button=>button.disabled=googleCalendarState.busy);
  return panel;
}
function openGoogleCalendarSetup() {
  const dialog=dailyDialog("Google Calendar setup"),steps=planningNode("ol","google-setup-steps");
  ["Download your Life OS information and restore backup. Confirm your existing boards are saved to cloud.",
    "Create a Google Cloud project and enable Google Calendar API. Configure Google Auth Platform; add your Google account as a test user.",
    "Create a Web application OAuth client. Add only openid and calendar.app.created permissions. Register the exact callback below.",
    "Deploy the private google-calendar Supabase function and its additive integration tables. Keep the client secret and encryption key in Supabase Edge Function Secrets, never in this website or chat.",
    "After the verified frontend is published, open live Life OS on HTTPS. Check connection, connect Google, then review a test board before enabling sync."].forEach(text=>steps.append(planningNode("li","",text)));
  dialog.append(steps,planningNode("code","google-callback",SUPABASE_CONFIG.url+"/functions/v1/google-calendar/callback"));
  const links=planningNode("div","google-calendar-actions");
  for(const [label,url] of [["Google Cloud Console","https://console.cloud.google.com/"],["Supabase Dashboard","https://supabase.com/dashboard"],["OAuth documentation","https://developers.google.com/identity/protocols/oauth2/web-server"]]) {
    const link=planningNode("a","planning-button",label);link.href=url;link.target="_blank";link.rel="noopener noreferrer";links.append(link);
  }
  dialog.append(links,planningNode("p","daily-muted","The full deployment and safety checklist is in GOOGLE-CALENDAR-CONNECT.md in your Life OS source folder. A Google project alone does not activate sync."));
}
let googleCalendarLastCheck=0;
async function googleCalendarAutoSync() {
  if(!googleCalendarAllowed() || googleCalendarState.busy || !cloudSession?.access_token || document.hidden || !navigator.onLine)return;
  googleCalendarState.busy=true;
  try {
    const session=await ensureCloudSession();
    if(googleCalendarState.owner!==session.user.id || Date.now()-googleCalendarLastCheck>300000) {
      googleCalendarLastCheck=Date.now();googleCalendarState.status=await googleCalendarRequest("status");
    }
    if(!googleCalendarState.status?.connected || !googleCalendarState.status.boardIds.includes(state.activeBoardId))return;
    const boardId=state.activeBoardId,cloudVersion=await googleCalendarCloudVersion(boardId);
    googleCalendarState.results=await googleCalendarRequest("sync",{boardId,cloudVersion});googleCalendarState.message="";
    googleCalendarState.status=await googleCalendarRequest("status");
  } catch(error) {googleCalendarState.message=error.message || "Google sync paused. Your records are kept.";}
  finally {
    googleCalendarState.busy=false;const panel=document.querySelector(".google-calendar-panel");
    if(panel && panel.open){const next=renderGoogleCalendarPanel();next.open=true;panel.replaceWith(next);}
  }
}
window.addEventListener("load",()=>{if(googleCalendarAllowed())setInterval(googleCalendarAutoSync,60000);});
