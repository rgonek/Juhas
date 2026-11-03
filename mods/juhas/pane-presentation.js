// Presence, rather than focus or zoom, determines the toolbar state.
export function reviewPane(panes,tab){return tab?panes.find(p=>p.tab===tab&&p.mod==='juhas'):undefined;}
export function togglePane(run,panes,tab){
 const pane=reviewPane(panes,tab);
 if(pane){run('pane.close',{pane:pane.pane});return;}
 const target=panes.find(p=>p.tab===tab&&p.focused)||panes.find(p=>p.tab===tab&&p.terminal);
 if(target)run('pane.split',{pane:target.pane,direction:'right',mod:'juhas',props:{role:'pane'}});
}
