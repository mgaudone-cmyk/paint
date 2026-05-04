let uploadedImage = null;
let template = null;
let colorPreview = false;

let state = {
  selectedColor: 1,
  completed: new Set(),
  undoStack: [],
  zoom: 1,
  pan: { x: 0, y: 0 },
  dragging: false,
  lastPoint: null
};

const $ = id => document.getElementById(id);

function init(){
  $("imageUpload").addEventListener("change", handleUpload);
  ["cropZoom","cropX","cropY"].forEach(id => $(id).addEventListener("input", drawCropPreview));
  $("convertBtn").addEventListener("click", convertImage);
  $("studioBtn").addEventListener("click", showStudio);
  $("togglePreviewBtn").addEventListener("click",()=>{colorPreview=!colorPreview;renderCanvas();$("togglePreviewBtn").textContent=colorPreview?"Paint Mode":"Color Preview";});
  $("hintBtn").addEventListener("click", showHint);
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", resetCurrent);
  $("zoomInBtn").addEventListener("click",()=>setZoom(state.zoom+.15));
  $("zoomOutBtn").addEventListener("click",()=>setZoom(state.zoom-.15));
  $("modalStudioBtn").addEventListener("click", showStudio);

  const stage = $("canvasStage");
  stage.addEventListener("pointerdown", e => {
    state.dragging = true;
    state.lastPoint = {x:e.clientX,y:e.clientY};
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    if(!state.dragging) return;
    const dx = e.clientX - state.lastPoint.x;
    const dy = e.clientY - state.lastPoint.y;
    if(Math.abs(dx)+Math.abs(dy)>2){
      state.pan.x += dx;
      state.pan.y += dy;
      state.lastPoint = {x:e.clientX,y:e.clientY};
      applyTransform();
    }
  });
  stage.addEventListener("pointerup",()=>state.dragging=false);
}

function handleUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const img = new Image();
  img.onload = () => {
    uploadedImage = img;
    drawCropPreview();
    showToast("Photo loaded. Adjust crop, then Convert.");
  };
  img.src = URL.createObjectURL(file);
}

function getCropParams(){
  return {
    zoom: Number($("cropZoom").value),
    offsetX: Number($("cropX").value) / 100,
    offsetY: Number($("cropY").value) / 100
  };
}

function drawCroppedToCanvas(destCanvas, size=420){
  if(!uploadedImage) return null;
  const img = uploadedImage;
  const ctx = destCanvas.getContext("2d", {willReadFrequently:true});
  destCanvas.width = size;
  destCanvas.height = size;

  const {zoom, offsetX, offsetY} = getCropParams();
  const sourceSize = Math.min(img.width, img.height) / zoom;
  const centerX = img.width / 2 + offsetX * img.width * 0.35;
  const centerY = img.height / 2 + offsetY * img.height * 0.35;
  const sx = Math.max(0, Math.min(img.width - sourceSize, centerX - sourceSize / 2));
  const sy = Math.max(0, Math.min(img.height - sourceSize, centerY - sourceSize / 2));

  ctx.clearRect(0,0,size,size);
  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
  return destCanvas;
}

function drawCropPreview(){
  if(!uploadedImage) return;
  drawCroppedToCanvas($("cropCanvas"), 500);
}

function convertImage(){
  if(!uploadedImage) return showToast("Upload a photo first.");

  showToast("Converting with improved engine...");
  setTimeout(()=>{
    const colorCount = Number($("colorCount").value);
    const detail = $("detailLevel").value;
    const bgMode = $("bgMode").value;
    template = imageToPaintTemplate(colorCount, detail, bgMode);
    state.selectedColor = 1;
    state.completed = new Set();
    state.undoStack = [];
    state.zoom = 1;
    state.pan = {x:0,y:0};
    colorPreview = false;
    $("togglePreviewBtn").textContent = "Color Preview";
    renderPreview(template);
    startPainting(template);
  },50);
}

function imageToPaintTemplate(colorCount, detail, bgMode){
  const grid = detail === "simple" ? 48 : detail === "balanced" ? 58 : 72;
  const work = document.createElement("canvas");
  drawCroppedToCanvas(work, grid);
  let ctx = work.getContext("2d", {willReadFrequently:true});

  // Edge-preserving-ish simplification: repeated soft blur + posterization.
  ctx = smoothCanvas(work, detail === "detailed" ? 1 : 2);

  if(bgMode !== "keep"){
    simplifyBackground(work, bgMode);
  }

  const data = ctx.getImageData(0,0,grid,grid);
  const pixels = [];
  for(let i=0;i<data.data.length;i+=4){
    pixels.push([data.data[i], data.data[i+1], data.data[i+2]]);
  }

  const centers = smartPalette(pixels, colorCount);
  const labels = pixels.map(p => nearestColorIndex(p, centers));

  // remove isolated pixel noise before region detection
  denoiseLabels(labels, grid, grid, detail === "detailed" ? 1 : 2);

  let regions = floodFillRegions(labels, grid, grid);
  regions = mergeAndFilterRegions(regions, labels, grid, grid, detail);

  const svgRegions = regions.map((reg, idx) => regionToSvg(reg, idx));
  const colors = centers.map(rgbToHex);

  return {title:"Photo Paint-by-Number", width:grid, height:grid, colors, regions:svgRegions};
}

function smoothCanvas(canvas, passes){
  let ctx = canvas.getContext("2d", {willReadFrequently:true});
  for(let p=0;p<passes;p++){
    const src = ctx.getImageData(0,0,canvas.width,canvas.height);
    const dst = ctx.createImageData(canvas.width,canvas.height);
    const w=canvas.width,h=canvas.height;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let sum=[0,0,0], count=0;
        for(let dy=-1;dy<=1;dy++){
          for(let dx=-1;dx<=1;dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=w||ny>=h) continue;
            const i=(ny*w+nx)*4;
            sum[0]+=src.data[i];sum[1]+=src.data[i+1];sum[2]+=src.data[i+2];count++;
          }
        }
        const o=(y*w+x)*4;
        dst.data[o]=sum[0]/count;dst.data[o+1]=sum[1]/count;dst.data[o+2]=sum[2]/count;dst.data[o+3]=255;
      }
    }
    ctx.putImageData(dst,0,0);
  }
  return ctx;
}

function simplifyBackground(canvas, mode){
  const ctx = canvas.getContext("2d", {willReadFrequently:true});
  const w=canvas.width,h=canvas.height;
  const data = ctx.getImageData(0,0,w,h);

  // crude subject estimate: preserve center oval, simplify outside
  const cx=w/2, cy=h/2, rx=w*0.36, ry=h*0.42;
  const corner = avgCorners(data,w,h);
  const plain = mode === "plain";

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const dx=(x-cx)/rx, dy=(y-cy)/ry;
      const inside = dx*dx + dy*dy < 1.08;
      if(!inside){
        const i=(y*w+x)*4;
        if(plain){
          data.data[i]=corner[0]; data.data[i+1]=corner[1]; data.data[i+2]=corner[2];
        }else{
          data.data[i]=Math.round((data.data[i]*0.25 + corner[0]*0.75)/24)*24;
          data.data[i+1]=Math.round((data.data[i+1]*0.25 + corner[1]*0.75)/24)*24;
          data.data[i+2]=Math.round((data.data[i+2]*0.25 + corner[2]*0.75)/24)*24;
        }
      }
    }
  }
  ctx.putImageData(data,0,0);
}

function avgCorners(data,w,h){
  const pts=[];
  const n=Math.max(3, Math.floor(w*0.12));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)pts.push([x,y],[w-1-x,y],[x,h-1-y],[w-1-x,h-1-y]);
  let s=[0,0,0];
  pts.forEach(([x,y])=>{const i=(y*w+x)*4;s[0]+=data.data[i];s[1]+=data.data[i+1];s[2]+=data.data[i+2];});
  return s.map(v=>Math.round(v/pts.length));
}

function smartPalette(pixels,k){
  // quantize first to prevent dozens of near-identical couch/fur tones
  const buckets = new Map();
  pixels.forEach(p=>{
    const key = p.map(v=>Math.round(v/28)*28).join(",");
    buckets.set(key,(buckets.get(key)||0)+1);
  });
  const sorted = [...buckets.entries()].sort((a,b)=>b[1]-a[1]).slice(0, k*8).map(([key,count])=>({rgb:key.split(",").map(Number),count}));
  let centers = [];
  // choose diverse frequent colors
  for(const item of sorted){
    if(centers.length>=k) break;
    if(centers.every(c=>colorDist(c,item.rgb)>1200)) centers.push(item.rgb);
  }
  while(centers.length<k && sorted.length) centers.push(sorted[centers.length % sorted.length].rgb);
  return centers;
}

function denoiseLabels(labels,w,h,passes){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(let p=0;p<passes;p++){
    const copy = labels.slice();
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const idx=y*w+x;
        const counts={};
        for(const [dx,dy] of dirs){
          const n=copy[(y+dy)*w+(x+dx)];
          counts[n]=(counts[n]||0)+1;
        }
        let best=copy[idx], bestC=0;
        for(const key in counts){
          if(counts[key]>bestC){bestC=counts[key];best=Number(key);}
        }
        if(bestC>=3) labels[idx]=best;
      }
    }
  }
}

function floodFillRegions(labels,w,h){
  const seen = new Uint8Array(w*h);
  const regions = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const start=y*w+x;
      if(seen[start]) continue;
      const color=labels[start];
      const stack=[[x,y]], cells=[];
      seen[start]=1;
      while(stack.length){
        const [cx,cy]=stack.pop();
        cells.push([cx,cy]);
        for(const [dx,dy] of dirs){
          const nx=cx+dx,ny=cy+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const ni=ny*w+nx;
          if(seen[ni]||labels[ni]!==color) continue;
          seen[ni]=1; stack.push([nx,ny]);
        }
      }
      regions.push({color:color+1,cells});
    }
  }
  return regions;
}

function mergeAndFilterRegions(regions,labels,w,h,detail){
  const minKeep = detail==="simple" ? 8 : detail==="balanced" ? 5 : 3;
  const minLabel = detail==="simple" ? 18 : detail==="balanced" ? 12 : 8;
  // MVP stable approach: keep all paintable zones but only label useful zones.
  return regions
    .filter(r=>r.cells.length>=minKeep)
    .map(r=>({...r,showLabel:r.cells.length>=minLabel}));
}

function regionToSvg(region, idx){
  const cells=region.cells;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  cells.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
  let d="";
  cells.forEach(([x,y])=>{d+=`M${x} ${y} H${x+1} V${y+1} H${x} Z `;});
  return {
    id:`r${idx}`,
    n:region.color,
    d,
    label:[(minX+maxX+1)/2,(minY+maxY+1)/2],
    showLabel:region.showLabel,
    size:cells.length
  };
}

function renderPreview(t){
  const canvas=$("previewCanvas");
  const ctx=canvas.getContext("2d");
  const scale=7;
  canvas.width=t.width*scale; canvas.height=t.height*scale;
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  t.regions.forEach(r=>{
    ctx.fillStyle=t.colors[r.n-1];
    const commands=r.d.match(/M[0-9.]+ [0-9.]+ H[0-9.]+ V[0-9.]+ H[0-9.]+ Z/g)||[];
    for(const cmd of commands){
      const nums=cmd.match(/[0-9.]+/g).map(Number);
      ctx.fillRect(nums[0]*scale,nums[1]*scale,scale,scale);
    }
  });
}

function startPainting(t){
  $("studioView").classList.remove("active");
  $("paintView").classList.add("active");
  $("studioBtn").classList.remove("hidden");
  $("completeModal").classList.add("hidden");
  $("artMeta").textContent = `${t.colors.length} colors · ${t.regions.length} regions · improved photo engine`;
  renderCanvas(); renderPalette(); updateProgress(); applyTransform();
}

function renderCanvas(){
  const t=template;
  const labels=t.regions.filter(r=>!state.completed.has(r.id)&&r.showLabel).map(r=>`<text class="region-label" x="${r.label[0]}" y="${r.label[1]}">${r.n}</text>`).join("");
  $("canvasInner").innerHTML=`<svg class="paint-svg" viewBox="0 0 ${t.width} ${t.height}">
    ${t.regions.map(r=>{
      const done=state.completed.has(r.id);
      const fill=colorPreview ? t.colors[r.n-1] : (done?t.colors[r.n-1]:"#fffdf8");
      return `<path class="region ${done?"filled":"unfilled"} ${colorPreview?"preview":""}" data-id="${r.id}" data-n="${r.n}" fill="${fill}" d="${r.d}" />`;
    }).join("")}
    ${colorPreview?"":labels}
  </svg>`;
  $("canvasInner").querySelectorAll(".region").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();paintRegion(el.dataset.id)}));
}

function renderPalette(){
  const t=template;
  $("palette").innerHTML=t.colors.map((color,idx)=>{
    const n=idx+1,total=t.regions.filter(r=>r.n===n).length,done=t.regions.filter(r=>r.n===n&&state.completed.has(r.id)).length;
    return `<button class="swatch ${state.selectedColor===n?"active":""} ${total&&done===total?"done":""}" data-n="${n}">
      <div class="color-dot" style="background:${color}"></div><strong>#${n}</strong><span>${done}/${total}</span>
    </button>`;
  }).join("");
  $("palette").querySelectorAll(".swatch").forEach(btn=>btn.addEventListener("click",()=>{state.selectedColor=Number(btn.dataset.n);renderPalette()}));
}

function paintRegion(id){
  const r=template.regions.find(x=>x.id===id);
  if(!r||state.completed.has(id)) return;
  if(r.n!==state.selectedColor){
    const el=$("canvasInner").querySelector(`[data-id="${id}"]`);
    if(el){el.classList.add("wrong");showToast(`That area needs color #${r.n}`);setTimeout(()=>{el.classList.remove("wrong");el.setAttribute("fill",colorPreview?template.colors[r.n-1]:"#fffdf8")},300);}
    return;
  }
  state.completed.add(id); state.undoStack.push(id);
  renderCanvas(); renderPalette(); updateProgress();
  if(state.completed.size===template.regions.length) $("completeModal").classList.remove("hidden");
}

function updateProgress(){
  if(!template) return;
  const pct=Math.round(state.completed.size/template.regions.length*100);
  $("progressText").textContent=`${pct}%`; $("progressBar").style.width=`${pct}%`;
}

function showHint(){
  const target=template?.regions.find(r=>r.n===state.selectedColor&&!state.completed.has(r.id));
  if(!target) return showToast("No unfinished areas for this color.");
  const el=$("canvasInner").querySelector(`[data-id="${target.id}"]`);
  if(el){el.classList.add("hint");setTimeout(()=>el.classList.remove("hint"),2300);}
}

function undo(){
  const last=state.undoStack.pop();
  if(!last) return showToast("Nothing to undo.");
  state.completed.delete(last); renderCanvas(); renderPalette(); updateProgress();
}

function resetCurrent(){
  state.completed.clear(); state.undoStack=[];
  renderCanvas(); renderPalette(); updateProgress(); showToast("Painting reset.");
}

function showStudio(){
  $("paintView").classList.remove("active"); $("studioView").classList.add("active");
  $("studioBtn").classList.add("hidden"); $("completeModal").classList.add("hidden");
}

function setZoom(v){state.zoom=Math.max(.65,Math.min(3,v));applyTransform();}
function applyTransform(){$("canvasInner").style.transform=`translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;}
function showToast(m){const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1600);}
function colorDist(a,b){return(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
function rgbToHex([r,g,b]){return"#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
function nearestColorIndex(p, centers){let best=0,bestD=Infinity;centers.forEach((c,i)=>{const d=colorDist(p,c);if(d<bestD){bestD=d;best=i;}});return best;}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
else init();
