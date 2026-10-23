function rotateSel(d){
  // Keep a move and its in-flight turns in the same undo entry.
  if (libDrag){
    libDrag.rot = norm((libDrag.rot || 0) + d);
    if (libDrag.ghost) libDrag.ghost.style.transform = `translate(-50%,-50%) rotate(${libDrag.rot}deg)`;
    return;
  }
  if (drag?.kind === 'move'){
    const f = getF(drag.id); if (!f) return;
    f.rot = norm(f.rot + d); drag.moved = true;
    renderFurn(); renderSel(); return;
  }
  if (window.View3D?.rotateDraggedFurniture?.(d)) return;
  if (ui.sel?.kind === 'furn') mutate(() => { const f = getF(ui.sel.id); f.rot = norm(f.rot + d); });
}
