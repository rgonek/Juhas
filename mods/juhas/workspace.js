export function workspaceFolders(text,workspacePath){
 // Match strings first so comment markers and commas inside paths stay intact.
 const tokens=/"(?:[^"\\]|\\[\s\S])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;
 const clean=text.replace(/^\uFEFF/,'').replace(tokens,token=>token.startsWith('"')?token:' ');
 const data=JSON.parse(clean.replace(/"(?:[^"\\]|\\[\s\S])*"|,(?=\s*[}\]])/g,token=>token===','?'':token));
 if(!Array.isArray(data?.folders))throw new Error('Missing workspace folders');
 const windows=/^(?:[a-z]:|[\\/]{2})/i.test(workspacePath);
 const file=windows?workspacePath.replace(/\\/g,'/'):workspacePath;
 const directory=file.slice(0,file.lastIndexOf('/')+1);
 return data.folders.map(entry=>{
  if(typeof entry?.path!=='string'||!entry.path.trim()||entry.path.includes('\0'))return null;
  const path=windows?entry.path.replace(/\\/g,'/'):entry.path;
  if(windows&&/^[a-z]:(?!\/)/i.test(path))return null;
  const absolute=path.startsWith('/')||(windows&&/^[a-z]:\//i.test(path));
  return {path:absolute?path:directory+path,name:typeof entry.name==='string'?entry.name.trim()||undefined:undefined};
 });
}
