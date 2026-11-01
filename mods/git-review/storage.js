import {createSession} from './review.js';
import {PREFIX} from './model.js';
export function loadSession(store,id){const s=store.get(`${PREFIX}.session.${id}`);if(s==null)return createSession(id);if(s.schemaVersion!==1||s.id!==id||!['drafts','repoKeys','comparisonIds','checkpoints','submittedBatches'].every(k=>Array.isArray(s[k])))throw new Error('Invalid session version or data; original data preserved');return s;}
export function saveSession(store,s){if(s.schemaVersion!==1)throw new Error('Unsupported session version');store.set(`${PREFIX}.session.${s.id}`,s);}
export function mutateSession(store,id,change){const s=change(loadSession(store,id));saveSession(store,s);return s;}
