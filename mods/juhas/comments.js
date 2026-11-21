export function commentTarget(c,file,start=null,end=null,lines=[]){
 const common={repoKey:c.repoKey,root:c.root,comparisonId:c.id,baseOid:c.baseOid,targetOid:c.targetOid,...(c.mutableTarget?{mutableTarget:true,baseTree:c.baseTree,targetTree:c.targetTree}:{}),oldPath:file.oldPath,newPath:file.newPath};
 if(!start)return {...common,side:null,startLine:null,endLine:null,quote:''};
 const side=start.side==='context'?'new':start.side;const last=end||start;const lastSide=last.side==='context'?'new':last.side;
 if(side!==lastSide)throw new Error('Select lines on the same side of the diff');
 const field=side==='old'?'oldLine':'newLine';const a=start[field],b=last[field];if(a==null||b==null)throw new Error('This row is not a commentable code line');
 const lo=Math.min(a,b),hi=Math.max(a,b);const selected=lines.length?lines.filter(l=>l[field]!=null&&l[field]>=lo&&l[field]<=hi):[start];
 return {...common,side,startLine:lo,endLine:hi,quote:selected.map(l=>l.text).join('\n')};
}
export function annotatePatch(patch,drafts,comparisonId,path){
 const relevant=drafts.filter(d=>d.comparisonId===comparisonId&&d.newPath===path);const comment=d=>({id:`comment-${d.id}`,kind:'comment',draft:d,text:d.body});
 const rows=[],byOldLine=new Map(),byNewLine=new Map();
 for(const [index,draft] of relevant.entries()){
  if(draft.side==null){rows.push(comment(draft));continue;}
  if(!draft.side)continue;
  const indexByLine=draft.side==='old'?byOldLine:byNewLine;
  let atLine=indexByLine.get(draft.endLine);
  if(!atLine)indexByLine.set(draft.endLine,atLine=[]);
  atLine.push({draft,index});
 }
 const hunks=patch?.hunks||[];
 for(let hi=0;hi<hunks.length;hi++){
  const h=hunks[hi];
  rows.push({id:`h${hi}`,kind:'hunk',hunk:h,text:h.header});
  for(let i=0;i<h.lines.length;i++){
   const line=h.lines[i];
   rows.push({...line,id:`h${hi}l${i}`,kind:'line',hunk:h});
   const old=byOldLine.get(line.oldLine),next=byNewLine.get(line.newLine);
   const comments=old&&next?[...old,...next].sort((a,b)=>a.index-b.index):old||next;
   if(comments)for(const {draft} of comments)rows.push(comment(draft));
  }
 }return rows;
}
export function composerRows(rows,target,editId=null){
 if(!target)return rows;const editor={id:'comment-editor',kind:'editor',draft:target,text:''};
 const existing=editId?rows.findIndex(row=>row.kind==='comment'&&row.draft.id===editId):-1;
 if(existing>=0)return rows.map((row,index)=>index===existing?editor:row);
 if(target.side==null)return [editor,...rows];
 const field=target.side==='old'?'oldLine':'newLine',index=rows.findIndex(row=>row.kind==='line'&&row[field]===target.endLine);
 return index<0?rows:[...rows.slice(0,index+1),editor,...rows.slice(index+1)];
}
export const INLINE_EDITOR_HEIGHT=112;
export const INLINE_EDITOR_MAX_HEIGHT=184;
export function commentHeight(value){return 38+21*(Math.min(6,Math.max(1,String(value||'').split(/\r?\n/).length))-1);}
