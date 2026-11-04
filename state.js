/* State v2. Migrates v1 ("jr": {id: {status, missing}}) and passes v2 through. Pure, so it is testable. */
export function migrate(raw, now = new Date().toISOString()){
  if (raw && raw.schema === 2) return {schema:2, jobs:raw.jobs || {}, custom:raw.custom || [], meta:{lastVisit:null, lastBackup:null, ...raw.meta}};
  const jobs = {};
  for (const [id, v] of Object.entries(raw || {})) if (v && typeof v === "object") jobs[id] = {...v, history: v.status ? [{status:v.status, at:now}] : []};
  return {schema:2, jobs, custom:[], meta:{lastVisit:null, lastBackup:null}};
}
