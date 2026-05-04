let savedArtworks=[];
try{savedArtworks=JSON.parse(localStorage.getItem("princessPaint:v2saved")||"[]")}catch(e){savedArtworks=[]}

let state={currentTemplate:null,selectedColor:1,completed:new Set(),undoStack:[],zoom:1,pan:{x:0,y:0},dragging:false,lastPoint:null};
const $=id=>document.getElementById(id);

const palettes={
royal:["#2b193d","#ffd6a5","#f8b195","#f67280","#c06c84","#6c5b7b","#355c7d","#fff1b8","#f9c74f","#ffffff","#7b2cbf","#c77dff","#ffafcc","#bde0fe","#4a4e69","#f2e9e4"],
forest:["#1b4332","#2d6a4f","#40916c","#74c69d","#d8f3dc","#ffd6a5","#f7b267","#6d597a","#b56576","#e56b6f","#ffffff","#283618","#dda15e","#bc6c25","#fefae0","#95d5b2"],
sea:["#03045e","#023e8a","#0077b6","#0096c7","#48cae4","#90e0ef","#caf0f8","#ffd6a5","#ffafcc","#cdb4db","#7209b7","#f72585","#ffffff","#006d77","#83c5be","#ffb703"],
snow:["#0b132b","#1c2541","#3a506b","#5bc0be","#caf0f8","#e0fbfc","#ffffff","#dbe7ff","#bde0fe","#a2d2ff","#cdb4db","#f7c6ff","#ffd6ff","#8ecae6","#4cc9f0","#90e0ef"],
rose:["#590d22","#800f2f","#a4133c","#c9184a","#ff4d6d","#ff8fa3","#ffb3c1","#fff0f3","#ffd6a5","#f7b267","#ffffff","#006d77","#83c5be","#cdb4db","#7209b7","#f72585"],
star:["#10002b","#240046","#3c096c","#5a189a","#7b2cbf","#9d4edd","#c77dff","#e0aaff","#ffd166","#ffafcc","#caf0f8","#ffffff","#4cc9f0","#f72585","#06d6a0","#118ab2"]
};

function init(){
  bindEvents();
  renderSavedGrid();
}

function bindEvents(){
  $("generateBtn").onclick=generateFromControls;
  $("studioBtn").addEventListener("click",showStudio);
  $("newVariantBtn").addEventListener("click",generateVariant);
  $("hintBtn").addEventListener("click",showHint);
  $("undoBtn").addEventListener("click",undo);
  $("resetBtn").addEventListener("click",resetCurrent);
  $("zoomInBtn").addEventListener("click",()=>setZoom(state.zoom+.15));
  $("zoomOutBtn").addEventListener("click",()=>setZoom(state.zoom-.15));
  $("modalStudioBtn").addEventListener("click",showStudio);
  const stage=$("canvasStage");
  stage.addEventListener("pointerdown",e=>{state.dragging=true;state.lastPoint={x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId)});
  stage.addEventListener("pointermove",e=>{if(!state.dragging)return;const dx=e.clientX-state.lastPoint.x,dy=e.clientY-state.lastPoint.y;if(Math.abs(dx)+Math.abs(dy)>2){state.pan.x+=dx;state.pan.y+=dy;state.lastPoint={x:e.clientX,y:e.clientY};applyTransform()}});
  stage.addEventListener("pointerup",()=>state.dragging=false);
}

function generateFromControls(){
  const p=$("princessType").value,pose=$("poseType").value,scene=$("sceneType").value,d=$("difficulty").value;
  const art=generatePrincess(p,pose,scene,d);
  saveGenerated(art);
  startTemplate(art);
}

function generateVariant(){
  const t=state.currentTemplate;if(!t)return;
  const art=generatePrincess(t.princessType,t.poseType,t.sceneType,t.difficultyKey);
  saveGenerated(art);
  startTemplate(art);
}

function generatePrincess(type,pose,scene,difficulty){
  const seed=Date.now();
  const colorCount=difficulty==="easy"?10:difficulty==="medium"?14:16;
  const colors=shuffle([...palettes[type]]).slice(0,colorCount);
  const detail=difficulty==="easy"?18:difficulty==="medium"?34:62;
  let regions=[
    ...background(scene),
    ...bodyAndDress(type,pose),
    ...headFaceHair(type,pose),
    ...dressLayers(type,pose,difficulty),
    ...accessories(type,pose),
    ...organicDetails(detail,type,scene)
  ];
  regions=regions.map((r,i)=>({...r,id:`${r.id}-${i}`,n:norm(r.n,colorCount)}));
  return {id:`princess-${type}-${seed}`,title:titleFor(type)+" #"+String(seed).slice(-4),category:"Princess",princessType:type,poseType:pose,sceneType:scene,difficulty:titleCase(difficulty),difficultyKey:difficulty,colors,viewBox:"0 0 420 520",regions};
}

function background(scene){
  let r=[{id:"bg",n:1,shape:"rect",attrs:{x:0,y:0,width:420,height:520},label:[45,45]}];
  if(scene==="castle"){
    r.push({id:"sky",n:2,shape:"path",d:"M0 0 H420 V245 C350 205 300 210 245 242 C170 285 90 220 0 265 Z",label:[80,110]});
    r.push({id:"castle",n:3,shape:"path",d:"M42 520 V300 H75 V235 H112 V300 H152 V210 H195 V300 H230 V250 H265 V300 H306 V225 H342 V300 H380 V520 Z",label:[210,390]});
    r.push({id:"roofA",n:4,shape:"path",d:"M85 235 L113 160 L142 235 Z",label:[113,210]});
    r.push({id:"roofB",n:4,shape:"path",d:"M170 210 L195 135 L220 210 Z",label:[195,185]});
    r.push({id:"moon",n:5,shape:"circle",attrs:{cx:336,cy:88,r:42},label:[336,88]});
  }
  if(scene==="garden"){
    r.push({id:"gardenSky",n:2,shape:"path",d:"M0 0 H420 V275 C330 215 270 270 220 240 C150 200 88 270 0 230 Z",label:[90,95]});
    r.push({id:"grass",n:3,shape:"path",d:"M0 280 C90 245 155 310 245 260 C315 225 360 275 420 250 V520 H0 Z",label:[210,410]});
    for(let i=0;i<16;i++){let x=rand(20,400),y=rand(320,500),s=rand(8,20);r.push({id:`gardenPetal${i}`,n:4+i%7,shape:"circle",attrs:{cx:x,cy:y,r:s},label:[x,y]})}
  }
  if(scene==="forest"){
    r.push({id:"forestSky",n:2,shape:"path",d:"M0 0 H420 V300 C330 235 260 285 190 255 C115 220 65 280 0 260 Z",label:[80,95]});
    for(let i=0;i<7;i++){let x=20+i*64+rand(-10,12);r.push({id:`trunk${i}`,n:3+i%3,shape:"path",d:`M${x} 520 L${x+22} 245 L${x+45} 520 Z`,label:[x+22,405]});r.push({id:`leaf${i}`,n:6+i%5,shape:"circle",attrs:{cx:x+23,cy:230+rand(-25,20),r:58+rand(-12,16)},label:[x+23,230]})}
  }
  if(scene==="stars"){
    r.push({id:"halo",n:2,shape:"circle",attrs:{cx:210,cy:190,r:185},label:[210,115]});
    for(let i=0;i<24;i++){let x=rand(24,396),y=rand(25,260),s=rand(6,17);r.push({id:`star${i}`,n:3+i%7,shape:"path",d:starPath(x,y,s),label:[x,y]})}
  }
  if(scene==="ocean"){
    r.push({id:"sunset",n:2,shape:"circle",attrs:{cx:330,cy:100,r:52},label:[330,100]});
    r.push({id:"water",n:3,shape:"path",d:"M0 265 C80 225 135 295 205 250 C285 205 340 285 420 240 V520 H0 Z",label:[210,405]});
    r.push({id:"wave",n:4,shape:"path",d:"M0 335 C100 300 135 370 220 325 C300 285 345 355 420 315 V390 C330 360 285 405 205 375 C120 340 75 390 0 355 Z",label:[210,350]});
  }
  return r;
}

function bodyAndDress(type,pose){
  let r=[];
  const cx=pose==="threequarter"?218:210;
  r.push({id:"neck",n:6,shape:"path",d:`M${cx-32} 258 C${cx-18} 292 ${cx+18} 292 ${cx+32} 258 L${cx+45} 335 H${cx-45} Z`,label:[cx,300]});
  r.push({id:"shoulders",n:10,shape:"path",d:`M${cx-112} 355 C${cx-65} 315 ${cx+65} 315 ${cx+112} 355 L${cx+145} 520 H${cx-145} Z`,label:[cx,405]});
  if(pose==="dancing"){
    r.push({id:"dressMain",n:11,shape:"path",d:`M${cx-55} 325 C${cx-145} 365 ${cx-178} 450 ${cx-198} 520 H${cx+198} C${cx+175} 445 ${cx+142} 365 ${cx+55} 325 C${cx+25} 345 ${cx-25} 345 ${cx-55} 325 Z`,label:[cx,455]});
  }else{
    r.push({id:"dressMain",n:11,shape:"path",d:`M${cx-62} 325 C${cx-108} 380 ${cx-138} 455 ${cx-156} 520 H${cx+156} C${cx+138} 455 ${cx+108} 380 ${cx+62} 325 C${cx+25} 350 ${cx-25} 350 ${cx-62} 325 Z`,label:[cx,455]});
  }
  r.push({id:"waist",n:8,shape:"rect",attrs:{x:cx-70,y:332,width:140,height:26},label:[cx,345]});
  return r;
}

function headFaceHair(type,pose){
  let r=[];
  const cx=pose==="threequarter"?218:210;
  const faceRx=pose==="threequarter"?76:82;
  r.push({id:"hairBack",n:7,shape:"path",d:`M${cx-104} 190 C${cx-128} 64 ${cx+130} 44 ${cx+112} 210 C${cx+92} 126 ${cx+48} 78 ${cx} 78 C${cx-55} 78 ${cx-96} 120 ${cx-104} 190 Z`,label:[cx,82]});
  r.push({id:"hairSideL",n:7,shape:"path",d:`M${cx-92} 140 C${cx-150} 190 ${cx-120} 292 ${cx-72} 330 C${cx-95} 250 ${cx-72} 175 ${cx-35} 105 Z`,label:[cx-92,230]});
  r.push({id:"hairSideR",n:9,shape:"path",d:`M${cx+75} 130 C${cx+140} 180 ${cx+122} 292 ${cx+70} 340 C${cx+102} 250 ${cx+75} 175 ${cx+30} 102 Z`,label:[cx+88,230]});
  r.push({id:"face",n:6,shape:"ellipse",attrs:{cx:cx,cy:178,rx:faceRx,ry:100,rot:pose==="threequarter"?-4:0},label:[cx,178]});
  r.push({id:"bangs",n:7,shape:"path",d:`M${cx-78} 130 C${cx-40} 70 ${cx+45} 70 ${cx+88} 128 C${cx+35} 112 ${cx-5} 118 ${cx-42} 146 C${cx-55} 134 ${cx-68} 130 ${cx-78} 130 Z`,label:[cx,112]});
  r.push({id:"hairHighlight1",n:14,shape:"path",d:`M${cx-50} 95 C${cx-70} 155 ${cx-65} 225 ${cx-30} 295 C${cx-42} 220 ${cx-35} 150 ${cx-8} 92 Z`,label:[cx-43,190]});
  r.push({id:"hairHighlight2",n:15,shape:"path",d:`M${cx+38} 98 C${cx+72} 165 ${cx+76} 230 ${cx+45} 303 C${cx+60} 225 ${cx+50} 160 ${cx+18} 98 Z`,label:[cx+54,190]});
  // Eyes: whites, iris, pupils, highlights, lids
  r.push({id:"eyeWhiteL",n:12,shape:"ellipse",attrs:{cx:cx-33,cy:166,rx:25,ry:18,rot:-5},label:[cx-33,166]});
  r.push({id:"eyeWhiteR",n:12,shape:"ellipse",attrs:{cx:cx+34,cy:166,rx:25,ry:18,rot:5},label:[cx+34,166]});
  r.push({id:"irisL",n:4,shape:"circle",attrs:{cx:cx-30,cy:167,r:11},label:[cx-30,167]});
  r.push({id:"irisR",n:4,shape:"circle",attrs:{cx:cx+31,cy:167,r:11},label:[cx+31,167]});
  r.push({id:"pupilL",n:1,shape:"circle",attrs:{cx:cx-29,cy:168,r:6},label:[cx-29,168]});
  r.push({id:"pupilR",n:1,shape:"circle",attrs:{cx:cx+30,cy:168,r:6},label:[cx+30,168]});
  r.push({id:"eyeSparkL",n:13,shape:"circle",attrs:{cx:cx-25,cy:162,r:3},label:[cx-25,162]});
  r.push({id:"eyeSparkR",n:13,shape:"circle",attrs:{cx:cx+35,cy:162,r:3},label:[cx+35,162]});
  r.push({id:"lidL",n:2,shape:"path",d:`M${cx-58} 154 C${cx-40} 142 ${cx-18} 145 ${cx-8} 157`,label:[cx-33,151]});
  r.push({id:"lidR",n:2,shape:"path",d:`M${cx+8} 157 C${cx+22} 144 ${cx+45} 142 ${cx+58} 154`,label:[cx+33,151]});
  r.push({id:"nose",n:6,shape:"path",d:`M${cx+2} 178 L${cx-10} 218 L${cx+16} 218 Z`,label:[cx+3,205]});
  r.push({id:"mouth",n:5,shape:"path",d:`M${cx-32} 236 C${cx-10} 258 ${cx+18} 258 ${cx+42} 236 C${cx+25} 272 ${cx-16} 272 ${cx-32} 236 Z`,label:[cx+4,252]});
  r.push({id:"cheekL",n:5,shape:"ellipse",attrs:{cx:cx-58,cy:220,rx:18,ry:10,rot:-8},label:[cx-58,220]});
  r.push({id:"cheekR",n:5,shape:"ellipse",attrs:{cx:cx+62,cy:220,rx:18,ry:10,rot:8},label:[cx+62,220]});
  return r;
}

function dressLayers(type,pose,difficulty){
  let r=[];
  const cx=pose==="threequarter"?218:210;
  r.push({id:"dressPanelCenter",n:12,shape:"path",d:`M${cx-35} 360 C${cx-48} 410 ${cx-58} 470 ${cx-65} 520 H${cx+65} C${cx+58} 470 ${cx+48} 410 ${cx+35} 360 Z`,label:[cx,450]});
  r.push({id:"dressPanelL",n:13,shape:"path",d:`M${cx-70} 365 C${cx-115} 415 ${cx-135} 475 ${cx-150} 520 H${cx-65} C${cx-60} 470 ${cx-48} 410 ${cx-35} 360 Z`,label:[cx-92,450]});
  r.push({id:"dressPanelR",n:14,shape:"path",d:`M${cx+70} 365 C${cx+115} 415 ${cx+135} 475 ${cx+150} 520 H${cx+65} C${cx+60} 470 ${cx+48} 410 ${cx+35} 360 Z`,label:[cx+92,450]});
  r.push({id:"bodice",n:8,shape:"path",d:`M${cx-55} 302 C${cx-22} 325 ${cx+22} 325 ${cx+55} 302 L${cx+42} 356 H${cx-42} Z`,label:[cx,333]});
  r.push({id:"necklace",n:9,shape:"path",d:`M${cx-40} 286 C${cx-15} 304 ${cx+15} 304 ${cx+40} 286 L${cx+28} 300 C${cx+8} 318 ${cx-8} 318 ${cx-28} 300 Z`,label:[cx,304]});
  const count=difficulty==="hard"?18:10;
  for(let i=0;i<count;i++){
    let x=rand(cx-135,cx+135),y=rand(370,510);
    r.push({id:`dressGem${i}`,n:4+i%10,shape:i%2?"circle":"ellipse",attrs:i%2?{cx:x,cy:y,r:rand(5,10)}:{cx:x,cy:y,rx:rand(6,13),ry:rand(4,10),rot:rand(0,160)},label:[x,y]});
  }
  return r;
}

function accessories(type,pose){
  let r=[];
  const cx=pose==="threequarter"?218:210;
  if(type==="royal"||type==="star"){
    r.push({id:"crownBase",n:9,shape:"path",d:`M${cx-62} 100 L${cx-35} 50 L${cx} 92 L${cx+35} 50 L${cx+62} 100 Z`,label:[cx,82]});
    r.push({id:"crownGem",n:5,shape:"circle",attrs:{cx:cx,cy:82,r:9},label:[cx,82]});
  }
  if(type==="forest"){
    r.push({id:"leafTiara",n:9,shape:"path",d:`M${cx-70} 108 C${cx-35} 75 ${cx+35} 75 ${cx+70} 108 C${cx+25} 96 ${cx-25} 96 ${cx-70} 108 Z`,label:[cx,98]});
    for(let i=0;i<6;i++){let x=cx-52+i*20,y=95+rand(-6,8);r.push({id:`leafGem${i}`,n:3+i%4,shape:"ellipse",attrs:{cx:x,cy:y,rx:11,ry:6,rot:rand(-40,40)},label:[x,y]})}
  }
  if(type==="sea"){
    r.push({id:"shellCrown",n:9,shape:"path",d:`M${cx-45} 103 C${cx-25} 65 ${cx+25} 65 ${cx+45} 103 C${cx+15} 90 ${cx-15} 90 ${cx-45} 103 Z`,label:[cx,90]});
  }
  if(type==="snow"){
    r.push({id:"iceCrown",n:9,shape:"path",d:`M${cx-65} 105 L${cx-42} 70 L${cx-18} 104 L${cx} 60 L${cx+18} 104 L${cx+42} 70 L${cx+65} 105 Z`,label:[cx,89]});
  }
  if(type==="rose"){
    for(let i=0;i<5;i++){let x=cx-45+i*22,y=93+rand(-8,6);r.push({id:`roseCrown${i}`,n:5+i%4,shape:"circle",attrs:{cx:x,cy:y,r:12},label:[x,y]})}
  }
  return r;
}

function organicDetails(count,type,scene){
  let r=[];
  for(let i=0;i<count;i++){
    let zone=Math.random(),x,y,size;
    if(zone<.25){x=rand(25,395);y=rand(30,230);size=rand(7,24)}
    else if(zone<.58){x=rand(80,340);y=rand(320,515);size=rand(7,28)}
    else{x=rand(25,395);y=rand(230,515);size=rand(8,32)}
    let kind=Math.random();
    if(kind<.34)r.push(blob(`blob${i}`,x,y,size,5+i%5,4+i%12));
    else if(kind<.68)r.push({id:`ellipseDetail${i}`,n:3+i%13,shape:"ellipse",attrs:{cx:x,cy:y,rx:size,ry:Math.max(5,size*rand(40,95)/100),rot:rand(0,180)},label:[x,y]});
    else r.push({id:`spark${i}`,n:5+i%11,shape:"path",d:starPath(x,y,size),label:[x,y]});
  }
  return r;
}

function blob(id,cx,cy,radius,points,n){
  let coords=[];
  for(let i=0;i<points;i++){let a=Math.PI*2*i/points,rr=radius*(.62+Math.random()*.55);coords.push({x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr})}
  let d=`M${coords[0].x} ${coords[0].y} `;
  for(let i=1;i<coords.length;i++)d+=`L${coords[i].x} ${coords[i].y} `;
  return{id,n,shape:"path",d:d+"Z",label:[cx,cy]}
}

function starPath(x,y,s){return`M${x} ${y-s} L${x+s*.32} ${y-s*.32} L${x+s} ${y} L${x+s*.32} ${y+s*.32} L${x} ${y+s} L${x-s*.32} ${y+s*.32} L${x-s} ${y} L${x-s*.32} ${y-s*.32} Z`}

function startTemplate(t){
  state.currentTemplate=t;state.selectedColor=1;state.undoStack=[];state.zoom=1;state.pan={x:0,y:0};
  let saved=JSON.parse(localStorage.getItem(saveKey(t.id))||"null");
  state.completed=new Set(saved?.completed||[]);
  $("artTitle").textContent=t.title;
  $("artMeta").textContent=`${t.princessType} · ${t.poseType} · ${t.sceneType} · ${t.difficulty} · ${t.colors.length} colors · ${t.regions.length} regions`;
  $("studioView").classList.remove("active");$("paintView").classList.add("active");$("studioBtn").classList.remove("hidden");
  renderCanvas();renderPalette();updateProgress();applyTransform();
}

function renderCanvas(){
  let t=state.currentTemplate;
  $("canvasInner").innerHTML=`<svg class="paint-svg" viewBox="${t.viewBox}">${t.regions.map(r=>{let done=state.completed.has(r.id),fill=done?t.colors[(r.n-1)%t.colors.length]:"#fffaf4";return shapeMarkup(r,fill,true,done)}).join("")}${t.regions.filter(r=>!state.completed.has(r.id)).map(r=>`<text class="region-label" x="${r.label[0]}" y="${r.label[1]}">${r.n}</text>`).join("")}</svg>`;
  $("canvasInner").querySelectorAll(".region").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();paintRegion(el.dataset.id)}));
}

function shapeMarkup(r,fill,interactive=true,done=false){
  let common=interactive?`class="region ${done?"filled":"unfilled"}" data-id="${r.id}" data-n="${r.n}" fill="${fill}"`:`fill="${fill}" stroke="#fff" stroke-width="1.6"`;
  if(r.shape==="path")return`<path ${common} d="${r.d}" />`;
  if(r.shape==="circle")return`<circle ${common} cx="${r.attrs.cx}" cy="${r.attrs.cy}" r="${r.attrs.r}" />`;
  if(r.shape==="rect")return`<rect ${common} x="${r.attrs.x}" y="${r.attrs.y}" width="${r.attrs.width}" height="${r.attrs.height}" />`;
  if(r.shape==="ellipse")return`<ellipse ${common} cx="${r.attrs.cx}" cy="${r.attrs.cy}" rx="${r.attrs.rx}" ry="${r.attrs.ry}" transform="rotate(${r.attrs.rot||0} ${r.attrs.cx} ${r.attrs.cy})" />`;
  return"";
}

function renderPalette(){
  let t=state.currentTemplate;
  $("palette").innerHTML=t.colors.map((color,idx)=>{
    let n=idx+1,total=t.regions.filter(r=>r.n===n).length,done=t.regions.filter(r=>r.n===n&&state.completed.has(r.id)).length;
    return`<button class="swatch ${state.selectedColor===n?"active":""} ${total&&done===total?"done":""}" data-n="${n}"><div class="color-dot" style="background:${color}"></div><strong>#${n}</strong><span>${done}/${total}</span></button>`
  }).join("");
  $("palette").querySelectorAll(".swatch").forEach(btn=>btn.addEventListener("click",()=>{state.selectedColor=Number(btn.dataset.n);renderPalette()}));
}

function paintRegion(id){
  let t=state.currentTemplate,r=t.regions.find(x=>x.id===id);
  if(!r||state.completed.has(id))return;
  if(r.n!==state.selectedColor){
    let el=$("canvasInner").querySelector(`[data-id="${id}"]`);
    el.classList.add("wrong");showToast(`That area needs color #${r.n}`);
    setTimeout(()=>{el.classList.remove("wrong");el.setAttribute("fill","#fffaf4")},300);
    return;
  }
  state.completed.add(id);state.undoStack.push(id);saveProgress();renderCanvas();renderPalette();updateProgress();
  if(state.completed.size===t.regions.length){localStorage.removeItem(saveKey(t.id));$("completeModal").classList.remove("hidden")}
}

function updateProgress(){let total=state.currentTemplate.regions.length,done=state.completed.size,pct=Math.round(done/total*100);$("progressText").textContent=`${pct}%`;$("progressBar").style.width=`${pct}%`}
function showHint(){let target=state.currentTemplate.regions.find(r=>r.n===state.selectedColor&&!state.completed.has(r.id));if(!target)return showToast("No unfinished areas for this color.");let el=$("canvasInner").querySelector(`[data-id="${target.id}"]`);el.classList.add("hint");setTimeout(()=>el.classList.remove("hint"),2300)}
function undo(){let last=state.undoStack.pop();if(!last)return showToast("Nothing to undo.");state.completed.delete(last);saveProgress();renderCanvas();renderPalette();updateProgress()}
function resetCurrent(){if(!state.currentTemplate)return;state.completed.clear();state.undoStack=[];saveProgress();renderCanvas();renderPalette();updateProgress();showToast("Painting reset.")}
function saveProgress(){let t=state.currentTemplate;localStorage.setItem(saveKey(t.id),JSON.stringify({completed:[...state.completed]}))}
function saveKey(id){return`princessPaint:v2save:${id}`}
function saveGenerated(t){savedArtworks.unshift(t);savedArtworks=savedArtworks.slice(0,9);localStorage.setItem("princessPaint:v2saved",JSON.stringify(savedArtworks));renderSavedGrid()}
function renderSavedGrid(){
  let grid=$("savedGrid");
  if(!savedArtworks.length){grid.innerHTML=`<p class="empty">No generated princesses yet.</p>`;return}
  grid.innerHTML=savedArtworks.map(t=>`<article class="template-card" data-id="${t.id}">${thumbnailSVG(t)}<div class="template-info"><h4>${t.title}</h4><p>${t.princessType} · ${t.sceneType} · ${t.colors.length} colors</p></div></article>`).join("");
  grid.querySelectorAll(".template-card").forEach(card=>card.addEventListener("click",()=>{let t=savedArtworks.find(x=>x.id===card.dataset.id);if(t)startTemplate(t)}));
}
function thumbnailSVG(t){return`<svg viewBox="${t.viewBox}" aria-hidden="true">${t.regions.map(r=>shapeMarkup(r,t.colors[(r.n-1)%t.colors.length],false)).join("")}</svg>`}
function setZoom(v){state.zoom=Math.max(.65,Math.min(2.7,v));applyTransform()}
function applyTransform(){$("canvasInner").style.transform=`translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`}
function showStudio(){$("paintView").classList.remove("active");$("studioView").classList.add("active");$("studioBtn").classList.add("hidden");$("completeModal").classList.add("hidden");renderSavedGrid()}
function showToast(m){let t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1400)}
function norm(n,c){return((n-1)%c)+1}
function rand(min,max){return Math.round(min+Math.random()*(max-min))}
function shuffle(a){return a.sort(()=>Math.random()-.5)}
function titleCase(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function titleFor(type){return{royal:"Royal Ball Princess",forest:"Forest Princess",sea:"Sea Princess",snow:"Snow Princess",rose:"Rose Garden Princess",star:"Star Princess"}[type]||"Princess"}
window.generateFromControls=generateFromControls;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
