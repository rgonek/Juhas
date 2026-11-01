export function commentTarget(c,file,start=null,end=null,lines=[]){
 const common={repoKey:c.repoKey,root:c.root,comparisonId:c.id,baseOid:c.baseOid,targetOid:c.targetOid,oldPath:file.oldPath,newPath:file.newPath};
 if(!start)return {...common,side:null,startLine:null,endLine:null,quote:''};
 const side=start.side==='context'?'new':start.side;const last=end||start;const lastSide=last.side==='context'?'new':last.side;
 if(side!==lastSide)throw new Error('Select lines on the same side of the diff');
 const field=side==='old'?'oldLine':'newLine';const a=start[field],b=last[field];if(a==null||b==null)throw new Error('This row is not a commentable code line');
 const lo=Math.min(a,b),hi=Math.max(a,b);const selected=lines.length?lines.filter(l=>l[field]!=null&&l[field]>=lo&&l[field]<=hi):[start];
 return {...common,side,startLine:lo,endLine:hi,quote:selected.map(l=>l.text).join('\n')};
}
export function annotatePatch(patch,drafts,comparisonId,path){
 const relevant=drafts.filter(d=>d.comparisonId===comparisonId&&d.newPath===path);const comment=d=>({id:`comment-${d.id}`,kind:'comment',draft:d,text:d.body});
 const rows=relevant.filter(d=>d.side==null).map(comment);
 for(const [hi,h] of (patch?.hunks||[]).entries()){
  rows.push({id:`h${hi}`,kind:'hunk',hunk:h,text:h.header});
  for(const [i,line] of h.lines.entries()){
   rows.push({...line,id:`h${hi}l${i}`,kind:'line',hunk:h});
   for(const d of relevant)if(d.side&&d.endLine===(d.side==='old'?line.oldLine:line.newLine))rows.push(comment(d));
  }
 }return rows;
}
