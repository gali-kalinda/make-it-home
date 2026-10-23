/* Result identity is based on source pixels, generated geometry and dimensions, never names. */
(function(root){
 function findImported(draft,catalogue=[],assets={}){
  if(!draft.entry)return null;
  const entry=draft.entry,p=entry.provenance||draft.asset?.provenance||{};
  return catalogue.find(existing=>{
   if(existing.id===entry.id||existing.id===draft.importedEntryId)return true;
   if(!['w','d','h'].every(k=>Number(existing[k])===Number(entry[k])))return false;
   const q=existing.provenance||assets[existing.assetId]?.provenance||{};
   return !!p.cropHash&&!!p.geometryHash&&p.cropHash===q.cropHash&&p.geometryHash===q.geometryHash;
  })||null;
 }
 function ready(draft,currentSignature){return !!draft.entry&&!draft.retainedId&&!['running','failed'].includes(draft.generation?.status)&&draft.signature===currentSignature;}
 function ordered(results){return results.map((draft,index)=>({draft,index})).sort((a,b)=>(b.draft.pinnedAt||0)-(a.draft.pinnedAt||0)||a.index-b.index);}
 function interrupted(draft){if(draft.generation?.status==='running')draft.generation={...draft.generation,status:'failed',text:'上次生成已中断，请重试此件。旧预览已保留。'};return draft;}
 function recoverFailures(session){for(const failure of session.failures||[]){const item=session.items.find(i=>i.id===failure.id);if(item&&!session.results.some(d=>d.item.id===item.id))session.results.push({item,entry:null,pinnedAt:Date.now(),generation:{status:'failed',text:failure.error||'上次生成未完成，请重试此件。'}});}return session.results;}
 const api={findImported,ready,ordered,interrupted,recoverFailures};if(typeof module==='object'&&module.exports)module.exports=api;else root.ImageReviewCore=api;
})(typeof window==='object'?window:globalThis);
