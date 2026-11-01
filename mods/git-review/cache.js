import {utf8Bytes} from './git.js';
export function createCache({maxEntries=64,maxBytes=67108864}={}){
 const map=new Map();let bytes=0;
 const remove=k=>{const v=map.get(k);if(v){bytes-=v.bytes;map.delete(k);}};
 return {get(k){const v=map.get(k);if(!v)return undefined;map.delete(k);map.set(k,v);return v.value;},set(k,value){remove(k);const size=utf8Bytes(JSON.stringify(value));if(size>maxBytes)return;map.set(k,{value,bytes:size});bytes+=size;while(bytes>maxBytes||map.size>maxEntries)remove(map.keys().next().value);},invalidateRepo(repoKey){for(const [k,v] of map)if(v.value?.repoKey===repoKey||k.includes(repoKey))remove(k);},get bytes(){return bytes;},get size(){return map.size;}};
}
export function createRequestGate(){let generation=0;return {begin(key){return {generation:++generation,key};},isCurrent(token){return token.generation===generation;}};}
