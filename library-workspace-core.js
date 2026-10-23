/* Personal catalogue navigation and favourites stay independent from room layouts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LibraryWorkspaceCore=api;})(globalThis,function(){
const owned=item=>!!item?.[5]?.catalogueId;
function key(item){return owned(item)?'mine:'+item[5].catalogueId:'public:'+JSON.stringify(item.slice(0,5));}
function normalize(value){return {tab:value?.tab==='mine'?'mine':'public',filter:['all','favorites','created'].includes(value?.filter)?value.filter:'all',favorites:[...new Set(Array.isArray(value?.favorites)?value.favorites.filter(k=>typeof k==='string'&&k.length<1000):[])]};}
function matches(item,prefs,query=''){
 const mine=owned(item),favorite=prefs.favorites.includes(key(item));
 if(prefs.tab==='public'&&mine)return false;
 if(prefs.tab==='mine'&&(prefs.filter==='favorites'?!favorite:prefs.filter==='created'?!mine:!mine&&!favorite))return false;
 return [item[0],typeof item[1]==='object'?Object.values(item[1]).join(' '):item[1],item[2],item[3]].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
function deletionRecords(plan,ids,now=Date.now()){
 if(!Array.isArray(ids)||!Number.isFinite(now)||now<=0)throw Error('删除选择无效');
 return [...new Set(ids)].map(id=>{const entry=plan.catalogue?.find(e=>e.id===id),asset=entry&&plan.assets?.[entry.assetId];if(!entry||!asset)throw Error('只能删除自己创建的家具，请刷新后重试');return {id,entry:JSON.parse(JSON.stringify(entry)),asset:JSON.parse(JSON.stringify(asset)),deletedAt:now};});
}
function repository(indexedDB){
 async function run(write,value){if(!indexedDB)throw Error('当前浏览器不能保存收藏');const db=await new Promise((res,rej)=>{const r=indexedDB.open('floorplan-library-workspace',1);let blocked=false;r.onupgradeneeded=()=>r.result.createObjectStore('preferences');r.onerror=()=>rej(r.error);r.onblocked=()=>{blocked=true;rej(Error('请关闭其他旧版页面后重试'));};r.onsuccess=()=>blocked?r.result.close():res(r.result);});try{return await new Promise((res,rej)=>{const tx=db.transaction('preferences',write?'readwrite':'readonly'),s=tx.objectStore('preferences'),r=write?s.put(normalize(value),'main'):s.get('main');tx.oncomplete=()=>res(write?undefined:normalize(r.result));tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||Error('收藏保存未完成'));});}finally{db.close();}}
 return {load:()=>run(false),save:value=>run(true,value)};
}
return {owned,key,normalize,matches,deletionRecords,repository};
});
