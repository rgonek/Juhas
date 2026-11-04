import {readFileSync,writeFileSync,mkdirSync,cpSync,copyFileSync,existsSync,readdirSync,statSync} from 'node:fs';
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
 const listen='init(_props, cx) {\n    this.reviewSpaces = {};\n    cx.spawn(async cx => { for (;;) { const raw = await nextCommand(); const command = typeof raw === "string" ? raw : raw.name; if (command === "review" && !routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout()); if (command === "open") openReview(run); if (command === "full") expandReview(run); } });';
 const integrated=imports+source.replace(init,listen).replace(enabled,'syncReviewSpace(run, this.reviewSpaces, spaces().find(s => s.active)?.id, layout());\n    const enabled = [...new Set([...(shared("workspace.panels") ?? ["files", "changes"]), "git-review-sidebar"])];').replace('if (on) run("layout.hide",','if (id === "git-review-sidebar") { toggleReview(run, layout()); return; }\n          if (on) run("layout.hide",').replace(anchor,'.child(panelButton("git-review-sidebar", "Juhas", "mods/juhas/icons/juhas.svg"))\n      '+anchor);
 return integrated.includes('const on = panel')?updateTabsSource(integrated):navigationSource('sidebar')+integrated;
}
// Upgrade only the known Juhas integration; preserve personal toolbar code.
export function updateTabsSource(source){
 source=source.replace('if (command === "review") toggleReview(run, layout());','if (command === "review" && !routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout());');
 if(source.includes('const juhasReviewState = () =>')&&source.includes('import { findReviewRoute, routeReview } from "./review-navigation.js";'))return source;
 if(source.includes('juhas-native-toggle')){
  source=source.replaceAll('reviewPane(juhasPanes(),juhasSpaces().find(s=>s.active)?.tabs.find(t=>t.active)?.id)', '(findReviewRoute(juhasReviewState())||reviewPane(juhasPanes(),juhasSpaces().find(s=>s.active)?.tabs.find(t=>t.active)?.id))');
  source=source.replace('()=>togglePane(', '()=>routeReview(juhasNavigationRun,juhasReviewState())||togglePane(');
  return navigationSource('pane')+source;
 }
 const click='if (id === "git-review-sidebar") { toggleReview(run, layout()); return; }';
 const active='const on = panel && !panel.hidden && body?.active === id;';
 if(!source.includes(click)||!source.includes(active))throw new Error('Tabs source has no supported Juhas integration; personal toolbar preserved');
 return navigationSource('sidebar')+source.replace(click,'if (id === "git-review-sidebar") { if (!routeReview(juhasNavigationRun,juhasReviewState())) toggleReview(run, layout()); return; }').replace(active,'const on = (id === "git-review-sidebar" && Boolean(findReviewRoute(juhasReviewState()))) || (panel && !panel.hidden && body?.active === id);');
}
function navigationSource(presentation){return `import { focused as juhasFocus, spaces as juhasNavigationSpaces, panes as juhasNavigationPanes, shared as juhasShared, setShared as juhasSetShared, layout as juhasLayout, run as juhasNavigationRun } from "herdr";
import { findReviewRoute, routeReview } from "./review-navigation.js";
const juhasReviewState = () => ({focus:juhasFocus(),spaces:juhasNavigationSpaces(),panes:juhasNavigationPanes(),shared:juhasShared,setShared:juhasSetShared,layout:juhasLayout(),presentation:"${presentation}"});
`;}
// Decorate a personal tabs mod without depending on sidebar/layout node IDs.
export function createPaneTabsSource(source){
 if(source.includes('juhas-native-toggle'))throw new Error('Tabs already contain the native Juhas button');
 const anchor=source.includes('.when(w?.buttons,')?'.when(w?.buttons,':'.when(window()?.buttons,';
 if(!source.includes(anchor))throw new Error('Tabs source has no supported window-button anchor');
 return updateTabsSource('import { panes as juhasPanes, spaces as juhasSpaces, run as juhasRun, theme as juhasTheme } from "herdr";\nimport { reviewPane, togglePane } from "./pane-presentation.js";\n'+source.replace(anchor,`.child(h_flex().id("juhas-native-toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
 .bg(reviewPane(juhasPanes(),juhasSpaces().find(s=>s.active)?.tabs.find(t=>t.active)?.id)?juhasTheme().selected:juhasTheme().chrome)
 .text_color(reviewPane(juhasPanes(),juhasSpaces().find(s=>s.active)?.tabs.find(t=>t.active)?.id)?juhasTheme().foreground:juhasTheme().muted)
 .on_mouse_down("left",(_e,cx)=>cx.stop_propagation())
 .on_click(()=>togglePane(juhasRun,juhasPanes(),juhasSpaces().find(s=>s.active)?.tabs.find(t=>t.active)?.id))
 .child(svg("mods/juhas/icons/juhas.svg").size(14)).child("Juhas"))
 `+anchor));
}
// Ship the instruction skill inside the mod; agent discovery installation is opt-in.
function copyBundledSkills(from,mod){
 const relative=join('skills','juhas-review-response','SKILL.md'),source=join(from,relative);
 if(!existsSync(source))return;
 const target=join(mod,relative);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
}
export function installLegacy({appHome,layoutName='main',source=resolve(dirname(fileURLToPath(import.meta.url)),'..'),now=Date.now()}){
 if(!/^[\w-]+$/.test(layoutName))throw new Error('Invalid layout name');
 const home=resolve(appHome);const original=JSON.parse(readFileSync(join(home,'layouts',`${layoutName}.json`),'utf8'));const built=buildLayout(original);
 const tabsSource=createTabsSource(readFileSync(join(home,'mods','tabs','main.js'),'utf8'));
 const mod=join(home,'mods','juhas');const layout=join(home,'layouts','juhas.json');const backup=join(home,'data',`juhas-backup-${now}`);
 const tabsMod=join(home,'mods','juhas-tabs');
 if(existsSync(mod)||existsSync(layout)||existsSync(tabsMod)){mkdirSync(backup,{recursive:true});if(existsSync(mod))cpSync(mod,join(backup,'juhas'),{recursive:true});if(existsSync(layout))cpSync(layout,join(backup,'juhas.json'));if(existsSync(tabsMod))cpSync(tabsMod,join(backup,'juhas-tabs'),{recursive:true});}
 mkdirSync(mod,{recursive:true});const from=join(source,'mods','juhas');
 for(const name of readdirSync(from)){if(name.endsWith('.js')||name==='mod.json'||name==='helpers'||name==='icons')cpSync(join(from,name),join(mod,name),{recursive:statSync(join(from,name)).isDirectory()});}
 copyBundledSkills(from,mod);
 mkdirSync(tabsMod,{recursive:true});copyFileSync(join(from,'review-navigation.js'),join(tabsMod,'review-navigation.js'));writeFileSync(join(tabsMod,'main.js'),tabsSource,'utf8');cpSync(join(from,'presentation.js'),join(tabsMod,'presentation.js'));writeFileSync(join(tabsMod,'mod.json'),JSON.stringify({place:'none',title:'Juhas tabs'}));
 writeFileSync(layout,JSON.stringify(built,null,2)+'\n');return {mod,tabsMod,layout,backup:existsSync(backup)?backup:null};
}
export function install({appHome,tabsName,updateTabsName,source=resolve(dirname(fileURLToPath(import.meta.url)),'..'),now=Date.now()}){
 const home=resolve(appHome),mod=join(home,'mods','juhas'),backup=join(home,'data',`juhas-backup-${now}`);
 let tabsMod,tabsSource;
 if(tabsName&&updateTabsName)throw new Error('Choose --tabs or --update-tabs');
 const targetTabs=tabsName||updateTabsName;
 if(targetTabs){if(!/^[\w-]+$/.test(targetTabs)||targetTabs==='tabs')throw new Error('Choose a personal tabs mod, not shipped tabs');tabsMod=join(home,'mods',targetTabs);const original=readFileSync(join(tabsMod,'main.js'),'utf8');tabsSource=updateTabsName?updateTabsSource(original):createPaneTabsSource(original);}

 if(existsSync(mod)){mkdirSync(backup,{recursive:true});cpSync(mod,join(backup,'juhas'),{recursive:true});}
 mkdirSync(mod,{recursive:true});const from=join(source,'mods','juhas');
 for(const name of readdirSync(from)){if(name.endsWith('.js')||name==='mod.json'||name==='helpers'||name==='icons')cpSync(join(from,name),join(mod,name),{recursive:statSync(join(from,name)).isDirectory()});}
 copyBundledSkills(from,mod);
 if(tabsMod){mkdirSync(backup,{recursive:true});cpSync(tabsMod,join(backup,targetTabs),{recursive:true});cpSync(join(from,'pane-presentation.js'),join(tabsMod,'pane-presentation.js'));copyFileSync(join(from,'review-navigation.js'),join(tabsMod,'review-navigation.js'));writeFileSync(join(tabsMod,'main.js'),tabsSource,'utf8');}
 return {mod,tabsMod,backup:existsSync(backup)?backup:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assertHerdrVersion(execFileSync('herdr-app',['--version'],{encoding:'utf8'}));
 const args=process.argv.slice(2);const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};const appHome=option('--app-home',process.env.HERDR_APP_HOME||join(homedir(),'.config','herdr-app'));
 const result=install({appHome,tabsName:option('--tabs',undefined),updateTabsName:option('--update-tabs',undefined)});console.log(JSON.stringify(result,null,2));
 execFileSync('herdr-app',['check',result.mod],{stdio:'inherit',env:{...process.env,HERDR_APP_HOME:appHome}});
 if(result.tabsMod)execFileSync('herdr-app',['check',result.tabsMod],{stdio:'inherit'});
 console.log('Open Juhas: herdr-app do pane.split --direction right --mod juhas');
}
