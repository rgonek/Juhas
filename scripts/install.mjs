import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
export function assertHerdrVersion(output){
 const match=String(output).match(/\b(\d+)\.(\d+)\.(\d+)\b/);if(!match)throw new Error('Cannot determine the Herdr App version; Juhas requires 0.1.11 or later');
 const [major,minor,patch]=match.slice(1).map(Number);if(!(major>0||minor>1||minor===1&&patch>=11))throw new Error(`Juhas requires Herdr App 0.1.11 or later; found ${match[0]}`);return match[0];
}
export function buildLayout(original){
 const tree=structuredClone(original);let terminal=null,panelBody=null,tabs=null;
 function inspect(node){if(/^git-review-/.test(node.id||''))throw new Error('Layout already contains Juhas');if(node.content?.tab==='active'&&!terminal)terminal=node;if(node.id==='panel-body')panelBody=node;if(node.id==='tabs')tabs=node;for(const child of node.children||[])inspect(child);}
 inspect(tree);if(!terminal)throw new Error('No active terminal area found in layout');
 const content=terminal.content;delete terminal.content;terminal.type='column';terminal.children=[{id:'git-review-work',type:'stack',active:'git-review-terminal',children:[{id:'git-review-terminal',type:'block',content},{id:'git-review-full',type:'block',content:{mod:'juhas',props:{role:'full'}}}]}];
 const review={id:'git-review-sidebar',type:'block',hidden:false,content:{mod:'juhas',props:{role:'sidebar'}}};
 if(panelBody)panelBody.children.push(review);
 else{const stack=terminal.children[0];terminal.children=[{id:'git-review-content',type:'row',children:[stack,{id:'panel',type:'column',hidden:true,size:{px:420},min:320,max:900,children:[{id:'panel-body',type:'stack',active:'git-review-sidebar',children:[review]}]}]}];}
 if(tabs?.content)tabs.content.mod='juhas-tabs';return tree;
}
export function createTabsSource(source){
 const init='init() {',enabled='const enabled = shared("workspace.panels") ?? ["files", "changes"];',anchor='.when(w?.buttons,';
 if(!source.includes(init)||!source.includes(enabled)||!source.includes(anchor))throw new Error('Installed tabs mod is not compatible with the Juhas button integration; no layout changed');
 const imports='import { nextCommand } from "herdr";\nimport { toggleReview, openReview, expandReview, syncReviewSpace } from "./presentation.js";\n';
 const listen='init(_props, cx) {\n    this.reviewSpaces = {};\n    cx.spawn(async cx => { for (;;) { const raw = await nextCommand(); const command = typeof raw === "string" ? raw : raw.name; if (command === "review") toggleReview(run, layout()); if (command === "open") openReview(run); if (command === "full") expandReview(run); } });';
 return imports+source.replace(init,listen).replace(enabled,'syncReviewSpace(run, this.reviewSpaces, spaces().find(s => s.active)?.id, layout());\n    const enabled = [...new Set([...(shared("workspace.panels") ?? ["files", "changes"]), "git-review-sidebar"])];').replace('if (on) run("layout.hide",','if (id === "git-review-sidebar") { toggleReview(run, layout()); return; }\n          if (on) run("layout.hide",').replace(anchor,'.child(panelButton("git-review-sidebar", "Juhas", "mods/changes/changes.svg"))\n      '+anchor);
}
export function install({appHome,layoutName='main',source=resolve(dirname(fileURLToPath(import.meta.url)),'..'),now=Date.now()}){
 if(!/^[\w-]+$/.test(layoutName))throw new Error('Invalid layout name');
 const home=resolve(appHome);const original=JSON.parse(readFileSync(join(home,'layouts',`${layoutName}.json`),'utf8'));const built=buildLayout(original);
 const tabsSource=createTabsSource(readFileSync(join(home,'mods','tabs','main.js'),'utf8'));
 const mod=join(home,'mods','juhas');const layout=join(home,'layouts','juhas.json');const backup=join(home,'data',`juhas-backup-${now}`);
 const tabsMod=join(home,'mods','juhas-tabs');
 if(existsSync(mod)||existsSync(layout)||existsSync(tabsMod)){mkdirSync(backup,{recursive:true});if(existsSync(mod))cpSync(mod,join(backup,'juhas'),{recursive:true});if(existsSync(layout))cpSync(layout,join(backup,'juhas.json'));if(existsSync(tabsMod))cpSync(tabsMod,join(backup,'juhas-tabs'),{recursive:true});}
 mkdirSync(mod,{recursive:true});const from=join(source,'mods','juhas');
 for(const name of readdirSync(from)){if(name.endsWith('.js')||name==='mod.json'||name==='helpers'||name==='icons')cpSync(join(from,name),join(mod,name),{recursive:statSync(join(from,name)).isDirectory()});}
 mkdirSync(tabsMod,{recursive:true});writeFileSync(join(tabsMod,'main.js'),tabsSource);cpSync(join(from,'presentation.js'),join(tabsMod,'presentation.js'));writeFileSync(join(tabsMod,'mod.json'),JSON.stringify({place:'none',title:'Juhas tabs'}));
 writeFileSync(layout,JSON.stringify(built,null,2)+'\n');return {mod,tabsMod,layout,backup:existsSync(backup)?backup:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assertHerdrVersion(execFileSync('herdr-app',['--version'],{encoding:'utf8'}));
 const args=process.argv.slice(2);const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};const appHome=option('--app-home',process.env.HERDR_APP_HOME||join(homedir(),'.config','herdr-app'));
 const result=install({appHome,layoutName:option('--layout','main')});console.log(JSON.stringify(result,null,2));
 execFileSync('herdr-app',['check',result.mod],{stdio:'inherit',env:{...process.env,HERDR_APP_HOME:appHome}});
 execFileSync('herdr-app',['check',result.tabsMod],{stdio:'inherit',env:{...process.env,HERDR_APP_HOME:appHome}});
 if(args.includes('--activate'))execFileSync('herdr-app',['do','layout.switch',JSON.stringify({name:'juhas'})],{stdio:'inherit',env:{...process.env,HERDR_APP_HOME:appHome}});
 else console.log('Installed without switching your active layout. Activate with: herdr-app do layout.switch --name juhas');
}
