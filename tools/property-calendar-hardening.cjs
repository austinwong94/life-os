// Keep one-time migration regeneration consistent with the maintained backend.
function hardenPropertyCalendar(code, slug) {
  if (!['ical-import','ical-cron-sync'].includes(slug)) return code;
  if (code.includes('import { fetchPropertyIcs, parsePropertyIcs }')) return code;
  const start=code.indexOf('function hostAllowed(');
  const end=code.indexOf(slug==='ical-import'?'propertyServe(':'async function secretOk(',start);
  if(start<0 || end<0 || !code.slice(start,end).includes('async function fetchIcs('))throw new Error('Calendar fetch boundary changed');
  const timeout=slug==='ical-import'?'FETCH_TIMEOUT_MS':'12_000';
  code=code.slice(0,start)+`async function fetchIcs(feedUrl: string): Promise<string> {
  return fetchPropertyIcs(feedUrl, { maxBytes: MAX_ICS_BYTES, timeoutMs: ${timeout} });
}

`+code.slice(end);
  code=code.replace(/^const ALLOWED_HOSTS = .*;\n/m,'').replace(/^const ALLOWED_HOST_SUFFIXES = .*;\n/m,'');
  code=code.replace('import { parseIcs } from "../_shared/ics.ts";','');
  code=code.replace('import { parseIcs, isOwnExportUid }','import { isOwnExportUid }');
  code=code.replaceAll('parseIcs(body,','parsePropertyIcs(body,');
  if(slug==='ical-cron-sync')code=code.replace('Called by pg_cron (x-cron-secret, no JWT — deploy with --no-verify-jwt).','Called by pg_cron with a gateway JWT and a separate private x-cron-secret.').replace('Refresh only when at least one feed succeeded','Refresh only when every configured feed succeeded');
  return 'import { fetchPropertyIcs, parsePropertyIcs } from "../_shared/property-ical.ts";\n'+code;
}
module.exports={hardenPropertyCalendar};
