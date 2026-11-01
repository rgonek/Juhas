/** Runtime uses plain serialisable records, keyed by machine + worktree + resolved trees. */
export const SCHEMA_VERSION=1;
export const PREFIX='git-review.v1';
export function repoKey(machine,root){return JSON.stringify([machine??null,root]);}
export function comparisonKey(repoKey,baseOid,targetOid,baseTree,targetTree){return JSON.stringify([repoKey,baseOid,targetOid,baseTree,targetTree]);}
