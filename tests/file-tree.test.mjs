import test from 'node:test';
import assert from 'node:assert/strict';
import {fileRows} from '../mods/juhas/review-ui.js';
const file=(path,id=path)=>({id,newPath:path});
test('single-child directories without files form one compact branch',()=>{
 const files=[file('Client/Pages/Clients/A.cs'),file('Client/Pages/Clients/B.cs')],rows=fileRows(files,true),folders=rows.filter(row=>row.directory);
 assert.equal(folders.length,1);assert.equal(folders[0].name,'Client/Pages/Clients');assert.equal(folders[0].path,'Client/Pages/Clients/');assert.equal(folders[0].fileCount,2);assert.deepEqual(rows.filter(row=>!row.directory).map(row=>row.id),files.map(row=>row.id));assert.equal(rows[1].depth,1);
});
test('compaction stops at files and branching; counts cover the entire subtree',()=>{
 const rows=fileRows([file('src/readme.md'),file('src/Pages/Clients/A.cs'),file('src/Pages/Clients/B.cs'),file('src/Shared/View.cs')],true),folders=rows.filter(row=>row.directory);
 assert.deepEqual(folders.map(row=>[row.name,row.fileCount]),[['src',4],['Pages/Clients',2],['Shared',1]]);
 const partial=fileRows([file('Client/info.md'),file('Client/Pages/Clients/A.cs')],true);assert.deepEqual(partial.filter(row=>row.directory).map(row=>row.name),['Client','Pages/Clients']);
});
test('collapsed compact folders keep their counts and hide all descendants',()=>{
 const files=[file('Client/Pages/Clients/A.cs'),file('Client/Pages/Clients/B.cs'),file('root.md')];
 for(const path of ['Client/','Client/Pages/','Client/Pages/Clients/']){const rows=fileRows(files,true,new Set([path]));assert.equal(rows.length,2);assert.equal(rows[0].closed,true);assert.equal(rows[0].fileCount,2);assert.ok(rows[0].paths.includes(path));assert.equal(rows[1].id,'root.md');}
});
test('flat mode remains unchanged and building a compact tree does not mutate file metadata',()=>{
 const files=[file('folder/inner/B.cs'),file('folder/inner/A.cs')],snapshot=JSON.stringify(files);assert.equal(fileRows(files,false),files);fileRows(files,true);assert.equal(JSON.stringify(files),snapshot);assert.deepEqual(fileRows([],true),[]);
});
