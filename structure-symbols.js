/* Supplementary labels, without changing room/furniture interactions. */
const beforeSymbolLabels=renderLabels;
renderLabels=function(){
  beforeSymbolLabels();if(!ui.layers.labels)return;
  const labels=[...document.querySelectorAll('#gLabels text')],rooms=ROOMS.filter(r=>r.at);
  for(const text of labels)text.textContent=text.textContent.replace(' · 用途推定','');
  for(let i=0;i<rooms.length;i++){const r=rooms[i];if(r.kind!=='bay_window')continue;labels[i*2]?.remove();labels[i*2+1]?.remove();
    const p=C.center(r.poly),bottom=Math.max(...r.poly.map(p=>p[1])),y=bottom+560,font=Math.max(170,10/view.s),label=(state.rooms[r.id]?.name||r.name)+(svg.clientWidth<700?'':' · 台高≈'+(r.elevation||700));
    $('#gLabels').insertAdjacentHTML('beforeend',`<g class="space-callout" data-space-label="${r.id}" pointer-events="none"><path d="M${p[0]} ${p[1]}V${y-160}" stroke="#6b8997" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${p[0]}" y="${y}" fill="#476c80" stroke="#fffdf8" stroke-width="20" paint-order="stroke" font-size="${font}" text-anchor="middle">${esc(label)}</text></g>`);
  }
};
renderAll();
