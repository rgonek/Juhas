export function resolveConfig(global={},repo={},branch={}){
 const merged={baseRef:null,baseRules:[],pinnedRoots:[],maxDepth:3,maxRepos:200,view:'sidebar',showAdvanced:false,...global,...repo,...branch};
 if(!Array.isArray(merged.baseRules)||!Array.isArray(merged.pinnedRoots))throw new Error('Invalid configuration');
 for(const rule of merged.baseRules){if(rule?.pattern!=null){if(typeof rule.pattern!=='string'||!rule.pattern||typeof rule.replacement!=='string')throw new Error('Invalid base rule: pattern and replacement must be strings');try{new RegExp(rule.pattern);}catch{throw new Error('Invalid base rule pattern');}}}
 return merged;
}
function matchingRefs(refs,candidate){
 const exact=refs.filter(ref=>typeof ref==='string'?ref===candidate:ref.fullName===candidate||ref.name===candidate);
 if(exact.length)return exact.map(ref=>typeof ref==='string'?ref:ref.fullName);
 return refs.filter(ref=>typeof ref!=='string'&&ref.fullName?.startsWith('refs/remotes/')&&ref.fullName.slice('refs/remotes/'.length).split('/').slice(1).join('/')===candidate).map(ref=>ref.fullName);
}
export function suggestBases(refs,branch,rules=[]){
 const found=new Map();
 for(const rule of rules){let candidate;
  if(typeof rule?.pattern==='string'&&typeof rule.replacement==='string'){const expression=new RegExp(rule.pattern);if(expression.test(branch))candidate=branch.replace(expression,rule.replacement);}
  else if(typeof rule?.prefix==='string'&&rule.prefix&&typeof rule.basePrefix==='string'&&branch.startsWith(rule.prefix))candidate=rule.basePrefix+branch.slice(rule.prefix.length);
  if(candidate)for(const ref of matchingRefs(refs,candidate))found.set(ref,{ref,reason:'Configured branch rule'});
 }
 return [...found.values()];
}
export function selectBase(refs,branch,config={},saved=''){
 if(saved)return {ref:saved,source:'manual'};
 if(config.baseRef)return {ref:config.baseRef,source:'configured'};
 const suggestions=suggestBases(refs,branch,config.baseRules||[]);
 return suggestions.length===1?{ref:suggestions[0].ref,source:'auto'}:null;
}
export async function readLocalConfig(read,path){
 let source;
 try{source=await read(path);}catch(error){if(error.code==='ENOENT'||/no such file or directory|system cannot find (?:the file|the path) specified|os error [23]\b/i.test(error.message||''))return {};throw error;}
 if(source==null)return {};
 try{const value=JSON.parse(source.replace(/^\uFEFF/,''));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected an object');resolveConfig(value);return value;}catch(error){throw new Error('Invalid Git Review local configuration: '+error.message);}
}
