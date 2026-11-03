import {readFiles} from './working-observation.js';
import {git,utf8Bytes} from './git.js';
const options=['--no-color','--no-ext-diff','--no-textconv','--find-renames=20%'];
function ends(c){return c.mutableTarget?[c.baseTree]:[c.baseTree,c.targetTree];}
export async function listChangedFiles(run,c){
 const files=c.observation?c.observation.files:await readFiles(run,c.repo,ends(c));
 for(const file of files)file.contentIdentity=JSON.stringify([file.oldPath,file.newPath,file.oldMode,file.newMode,file.oldOid,file.newOid]);
 return files;
}
export function parsePatch(text,fileId,{maxBytes=4194304,maxRows=20000}={}){
 const bytes=utf8Bytes(text);const lines=text.split('\n');const hunks=[];let hunk=null,old=0,next=0,rows=0,complete=true;
 for(const line of lines){
  if(++rows>maxRows){complete=false;break;}
  const m=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
  if(m){old=Number(m[1]);next=Number(m[2]);hunk={header:line,lines:[]};hunks.push(hunk);continue;}
  if(!hunk)continue;const kind=line[0];
  if(kind==='-')hunk.lines.push({side:'old',oldLine:old++,newLine:null,text:line.slice(1)});
  else if(kind==='+')hunk.lines.push({side:'new',oldLine:null,newLine:next++,text:line.slice(1)});
  else if(kind===' ')hunk.lines.push({side:'context',oldLine:old++,newLine:next++,text:line.slice(1)});
 }
 if(bytes>maxBytes){complete=false;return {fileId,hunks:[],complete,reason:`Diff exceeds ${maxBytes} bytes`,binary:false};}
 return {fileId,hunks,complete,reason:complete?null:`Diff exceeds ${maxRows} rows`,binary:/^Binary files |^GIT binary patch/m.test(text),modeOnly:!hunks.length&&!/^Binary files /m.test(text)};
}
export async function loadPatch(run,c,file,limits={}){
 let r;
 if(file.untracked){r=await run(c.repo,['diff',...options,'--no-index','--','/dev/null',file.newPath]);if(r.code!==0&&r.code!==1)throw new Error(r.stderr||'Cannot read untracked file');}
 else r={stdout:await git(run,c.repo,['diff',...options,...(limits.full?['--unified=20000']:[]),...ends(c),'--',`:(literal)${file.oldPath??file.newPath}`,...(file.oldPath!==file.newPath?[`:(literal)${file.newPath}`]:[])])};
 return {...parsePatch(r.stdout,file.id,limits),full:!!limits.full};
}
