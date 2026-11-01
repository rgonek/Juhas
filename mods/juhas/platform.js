export async function readDirectories(exec,appHome,machine,root){
 if(machine)throw new Error('Remote discovery is not supported in this release; add a local repository');
 if(/^[a-z]:[\\/]|^\\\\/i.test(root)){
  const r=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',`${appHome}/mods/juhas/helpers/list-directories.ps1`,'-Root',root]);
  if(r.code!==0)throw new Error(r.stderr||'Cannot list directories');const result=JSON.parse(r.stdout||'[]');return Array.isArray(result)?result:[result];
 }
 const pattern=root.replace(/[\\*?\[\]]/g,'\\$&');const r=await exec('find',[root,'-path',pattern,'-o','-prune','-type','d','-print0']);if(r.code!==0)throw new Error(r.stderr||'Cannot list directories');
 return r.stdout.split('\0').filter(Boolean).map(path=>({path,isDirectory:true,isLink:false}));
}
