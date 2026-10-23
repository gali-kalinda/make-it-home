/* Two-dimensional plans and three-dimensional catalogue images follow the view. */
const originalBuildLibrary=buildLib;
let libraryPreviewFrame=0,libraryPreviewGeneration=0;
buildLib=function(){
  originalBuildLibrary();
  document.querySelectorAll('#lib .item').forEach(el=>{
    const artwork=document.createElement('div');artwork.className='library-artwork';
    const plan=el.querySelector('svg');plan.classList.add('library-plan');artwork.append(plan);
    const image=document.createElement('img');image.className='library-model';image.draggable=false;image.alt=el.querySelector('b').textContent+' · 立体模型预览';artwork.append(image);
    const status=document.createElement('span');status.className='library-preview-status';status.textContent='生成立体预览…';artwork.append(status);
    el.prepend(artwork);
  });
  refreshLibraryPreviews();
};
const viewIndicator=document.createElement('div');viewIndicator.className='library-view-indicator';document.querySelector('#libraryHeading').after(viewIndicator);
function refreshLibraryPreviews(){
  cancelAnimationFrame(libraryPreviewFrame);
  const generation=++libraryPreviewGeneration;
  const isModelView=is3D(),hidden=$('#lib').hidden;
  viewIndicator.hidden=hidden;viewIndicator.textContent=isModelView?'3D 立体模型 · 拖入场景布置':'2D 俯视平面 · 按实际尺寸布置';
  document.querySelectorAll('#lib .item').forEach(el=>el.title=$('#lib').classList.contains('library-managing')?(el.querySelector('.library-select-control')?tr('点击选择或取消选择','Click to select or deselect'):tr('公用家具','Public furniture')):isModelView?tr('点击添加，或拖到三维场景中的指定位置','Click to add, or drag into the 3D scene'):tr('点击添加，或拖到平面图中的指定位置','Click to add, or drag onto the plan'));
  if(!isModelView||hidden||!window.View3D?.inspect().inited)return;
  const pending=[...document.querySelectorAll('#lib .item')].filter(el=>!el.hidden&&!el.dataset.modelPreview);
  const next=async()=>{
    if(generation!==libraryPreviewGeneration||!is3D()||$('#lib').hidden)return;
    const el=pending.shift();if(!el)return;
    try{const item=itemOf(el);await View3D.prepareLibraryItem?.(item);if(generation!==libraryPreviewGeneration)return;el.querySelector('.library-model').src=View3D.libraryThumbnail(item);el.dataset.modelPreview='ready';}
    catch(e){el.dataset.modelPreview='error';el.querySelector('.library-preview-status').textContent='立体预览暂不可用';console.error('Furniture preview failed',itemOf(el)[0],e);}
    if(pending.length)libraryPreviewFrame=requestAnimationFrame(next);
  };
  libraryPreviewFrame=requestAnimationFrame(next);
}
window.refreshLibraryPreviews=refreshLibraryPreviews;
const updateStudioBeforePreviews=window.updateStudio;
window.updateStudio=function(){updateStudioBeforePreviews();refreshLibraryPreviews();};
const setViewBeforePreviews=setView;
setView=async function(view){try{return await setViewBeforePreviews(view);}finally{refreshLibraryPreviews();}};
buildLib();
