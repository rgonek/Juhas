import * as fs from 'fs/promises';

function childPath(root,name){
 const separator=/^(?:[a-z]:\\|\\\\)/i.test(root)?'\\':'/';
 return root.replace(/[\\/]$/,'')+separator+name;
}
async function exists(path){
 if(fs.exists)return fs.exists(path);
 try{await fs.access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}
function localListing(root,listings){
 if(!listings)return fs.readdir(root,{withFileTypes:true});
 if(!listings.has(root))listings.set(root,fs.readdir(root,{withFileTypes:true}));
 return listings.get(root);
}
async function windowsListing(exec,appHome,root,listings){
 const key='windows:'+root;
 const read=async()=>{
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',`${appHome}/mods/juhas/helpers/list-directories.ps1`,'-Root',root]);
  if(result.code!==0)throw new Error(result.stderr||'Cannot list project directory');
  return JSON.parse(result.stdout);
 };
 if(!listings)return read();
 if(!listings.has(key))listings.set(key,read());
 return listings.get(key);
}
export async function readDirectories(exec,appHome,machine,root,{markersOnly=false,listings}={}){
 if(machine)throw new Error('Remote discovery is not supported in this release; add a local repository');
 if(/^(?:[a-z]:[\\/]|[\\/])/i.test(root)){
  try{
   const entries=await localListing(root,listings);
   const directories=entries.filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink?.()&&!['.git','node_modules','.superpowers'].includes(entry.name));
   const rows=[];
   // Bound concurrent filesystem calls even when the directory contains many folders.
   for(let i=0;i<directories.length;i+=16){
    rows.push(...await Promise.all(directories.slice(i,i+16).map(async entry=>{
     const path=childPath(root,entry.name);
     return {path,isDirectory:true,isLink:false,hasGit:await exists(childPath(path,'.git'))};
    })));
   }
   return markersOnly?rows.filter(row=>row.hasGit):rows;
  }catch{/* Projects outside native read roots use the OS directory reader. */}
 }
 if(/^[a-z]:[\\/]|^\\\\/i.test(root)){
  return (await windowsListing(exec,appHome,root,listings)).directories;
 }
 if(markersOnly){
  const r=await exec('find',['.','-mindepth','2','-maxdepth','2','-name','.git','(','-type','d','-o','-type','f',')','-print0'],{cwd:root});
  if(r.code!==0)throw new Error(r.stderr||'Cannot find Git markers');
  return r.stdout.split('\0').filter(Boolean).map(path=>({path:root.replace(/\/$/,'')+'/'+path.slice(2,-5),isDirectory:true,isLink:false,hasGit:true}));
 }
 const pattern=root.replace(/[\\*?\[\]]/g,'\\$&');const r=await exec('find',[root,'-path',pattern,'-o','-prune','-type','d','-print0']);if(r.code!==0)throw new Error(r.stderr||'Cannot list directories');
 return r.stdout.split('\0').filter(Boolean).map(path=>({path,isDirectory:true,isLink:false}));
}
export async function readWorkspacePaths(exec,appHome,root,{listings}={}){
 if(/^(?:[a-z]:[\\/]|[\\/])/i.test(root)){
  try{
   const entries=await localListing(root,listings);
   return entries.filter(entry=>!entry.isDirectory()&&!entry.isSymbolicLink?.()&&(entry.isFile?.()??true)&&entry.name.endsWith('.code-workspace')).map(entry=>childPath(root,entry.name));
  }catch{/* Projects outside native read roots use the OS directory reader. */}
 }
 const windows=/^[a-z]:[\\/]|^[\\/]{2}/i.test(root);
 if(windows)return (await windowsListing(exec,appHome,root,listings)).workspaces;
 const result=await exec('find',['.','!','-name','.','-prune','-type','f','-name','*.code-workspace','-print0'],{cwd:root});
 if(result.code!==0)throw new Error(result.stderr||'Cannot list workspace files');
 return result.stdout.split('\0').filter(Boolean).map(path=>childPath(root,path.slice(2)));
}
