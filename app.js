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
  $("togglePreviewBtn").addEventListener("click",()=>{colorPreview=!colorPreview;drawPaintCanvas();$("togglePreviewBtn").textContent=colorPreview?"Paint Mode":"Color Preview";});
  $("hintBtn").addEventListener("click", showHint);
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", resetCurrent);
  $("zoomInBtn").addEventListener("click",()=>setZoom(state.zoom+.15));
  $("zoomOutBtn").addEventListener("click",()=>setZoom(state.zoom-.15));
  $("modalStudioBtn").addEventListener("click", showStudio);

  const canvas = $("paintCanvas");
  canvas.addEventListener("click", handlePaintClick);
  canvas.addEventListener("touchend", e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if(t) handlePaintPointer(t.clientX, t.clientY);
  }, {passive:false});

  const stage = $("canvasStage");
  stage.addEventListener("pointerdown", e => {
    if(e.target.id === "paintCanvas") return;
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
    showToast("Image loaded. Convert when ready.");
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

function drawCroppedToCanvas(destCanvas, size=600){
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

  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,size,size);
  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
  return destCanvas;
}

function drawCropPreview(){
  if(!uploadedImage) return;
  drawCroppedToCanvas($("cropCanvas"), 600);
}

function convertImage(){
  if(!uploadedImage) return showToast("Upload an image first.");
  showToast("Converting clean regions...");
  setTimeout(()=>{
    const colorCount = Number($("colorCount").value);
    const mode = $("imageMode").value;
    const regionSize = $("regionSize").value;
    template = buildTemplate(colorCount, mode, regionSize);
    state.selectedColor = 1;
    state.completed = new Set();
    state.undoStack = [];
    state.zoom = 1;
    state.pan = {x:0,y:0};
    colorPreview = false;
    $("togglePreviewBtn").textContent = "Color Preview";
    drawSimplifiedPreview();
    startPainting();
  },50);
}

function buildTemplate(colorCount, mode, regionSize){
  const grid = mode === "lineart" ? 90 : 70;
  const work = document.createElement("canvas");
  drawCroppedToCanvas(work, grid);
  const ctx = work.getContext("2d", {willReadFrequently:true});
  let img = ctx.getImageData(0,0,grid,grid);
  if(mode === "photo"){
    img = smoothImageData(img, grid, grid, 1);
  }

  const lineMask = new Uint8Array(grid*grid);
  const pixels = [];
  const indexMap = new Int32Array(grid*grid);
  indexMap.fill(-1);

  for(let y=0;y<grid;y++){
    for(let x=0;x<grid;x++){
      const i=(y*grid+x)*4;
      const r=img.data[i], g=img.data[i+1], b=img.data[i+2];
      const lum = 0.299*r+0.587*g+0.114*b;
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      const isLine = lum < (mode==="lineart"?95:65) && (max-min < 95 || lum < 55);
      if(isLine){
        lineMask[y*grid+x]=1;
      }else{
        indexMap[y*grid+x]=pixels.length;
        pixels.push([r,g,b]);
      }
    }
  }

  const centers = smartPalette(pixels, colorCount);
  const labels = new Int16Array(grid*grid);
  labels.fill(-1);

  for(let y=0;y<grid;y++){
    for(let x=0;x<grid;x++){
      const idx=y*grid+x;
      if(lineMask[idx]) continue;
      const pIndex = indexMap[idx];
      if(pIndex >= 0) labels[idx] = nearestColorIndex(pixels[pIndex], centers);
    }
  }

  denoiseLabels(labels, lineMask, grid, grid, mode==="lineart"?2:1);

  let regions = floodFillRegions(labels, lineMask, grid, grid);
  regions = filterRegions(regions, regionSize);
  const regionMap = new Int32Array(grid*grid);
  regionMap.fill(-1);
  regions.forEach((reg, id) => reg.cells.forEach(([x,y]) => regionMap[y*grid+x] = id));

  return {
    width:grid,
    height:grid,
    colors:centers.map(rgbToHex),
    lineMask,
    regions,
    regionMap
  };
}

function smartPalette(pixels,k){
  const buckets = new Map();
  pixels.forEach(p=>{
    // keep near-white as its own bucket but prevent infinite subtle tones
    const key = p.map(v=>Math.round(v/30)*30).join(",");
    buckets.set(key,(buckets.get(key)||0)+1);
  });
  const sorted = [...buckets.entries()]
    .sort((a,b)=>b[1]-a[1])
    .map(([key,count])=>({rgb:key.split(",").map(Number),count}));

  const centers = [];
  for(const item of sorted){
    if(centers.length>=k) break;
    if(centers.every(c=>colorDist(c,item.rgb)>900)) centers.push(item.rgb);
  }
  while(centers.length<k && sorted.length) centers.push(sorted[centers.length % sorted.length].rgb);
  while(centers.length<k) centers.push([240,240,240]);
  return centers;
}

function denoiseLabels(labels,lineMask,w,h,passes){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(let p=0;p<passes;p++){
    const copy = labels.slice();
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const idx=y*w+x;
        if(lineMask[idx] || copy[idx] < 0) continue;
        const counts={};
        for(const [dx,dy] of dirs){
          const n=copy[(y+dy)*w+(x+dx)];
          if(n>=0) counts[n]=(counts[n]||0)+1;
        }
        let best=copy[idx], bestC=0;
        for(const key in counts){ if(counts[key]>bestC){bestC=counts[key];best=Number(key);} }
        if(bestC>=5) labels[idx]=best;
      }
    }
  }
}

function floodFillRegions(labels,lineMask,w,h){
  const seen = new Uint8Array(w*h);
  const regions = [];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const start=y*w+x;
      if(seen[start] || lineMask[start] || labels[start]<0) continue;
      const color=labels[start];
      const stack=[[x,y]], cells=[];
      seen[start]=1;
      while(stack.length){
        const [cx,cy]=stack.pop();
        cells.push([cx,cy]);
        for(const [dx,dy] of dirs){
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const ni=ny*w+nx;
          if(seen[ni]||lineMask[ni]||labels[ni]!==color) continue;
          seen[ni]=1; stack.push([nx,ny]);
        }
      }
      regions.push({id:regions.length,n:color+1,cells});
    }
  }
  return regions;
}

function filterRegions(regions, regionSize){
  const min = regionSize === "small" ? 4 : regionSize === "medium" ? 10 : 20;
  const labelMin = regionSize === "small" ? 18 : regionSize === "medium" ? 28 : 40;

  return regions
    .filter(r=>r.cells.length>=min)
    .map((r,i)=>{
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      r.cells.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
      return {
        ...r,
        id:i,
        label:[(minX+maxX+1)/2,(minY+maxY+1)/2],
        showLabel:r.cells.length>=labelMin,
        size:r.cells.length
      };
    });
}

function drawSimplifiedPreview(){
  const canvas = $("previewCanvas");
  const scale = 6;
  canvas.width = template.width*scale;
  canvas.height = template.height*scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  drawTemplateToContext(ctx, scale, true, true);
}

function startPainting(){
  $("studioView").classList.remove("active");
  $("paintView").classList.add("active");
  $("studioBtn").classList.remove("hidden");
  $("completeModal").classList.add("hidden");
  $("artMeta").textContent = `${template.colors.length} colors · ${template.regions.length} usable regions · clean line-art engine`;
  const canvas=$("paintCanvas");
  canvas.width=template.width*8;
  canvas.height=template.height*8;
  drawPaintCanvas();
  renderPalette();
  updateProgress();
  applyTransform();
}

function drawPaintCanvas(){
  if(!template) return;
  const canvas=$("paintCanvas");
  const scale=8;
  canvas.width=template.width*scale;
  canvas.height=template.height*scale;
  const ctx=canvas.getContext("2d");
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  drawTemplateToContext(ctx, scale, colorPreview, false);
}

function drawTemplateToContext(ctx, scale, preview, thumbnail){
  const t=template;
  // fill regions without drawing a grid
  for(const r of t.regions){
    const done = state.completed.has(r.id);
    ctx.fillStyle = (preview || done) ? t.colors[r.n-1] : "#fffdf8";
    for(const [x,y] of r.cells){
      ctx.fillRect(x*scale,y*scale,scale,scale);
    }
  }

  // draw original line mask as thick black outlines
  ctx.fillStyle="#111";
  for(let y=0;y<t.height;y++){
    for(let x=0;x<t.width;x++){
      if(t.lineMask[y*t.width+x]){
        ctx.fillRect(x*scale,y*scale,scale,scale);
      }
    }
  }

  if(preview || thumbnail) return;

  // Draw only useful labels
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.font=`900 ${Math.max(10,scale*2.1)}px -apple-system,BlinkMacSystemFont,Arial`;
  ctx.lineWidth=3;
  for(const r of t.regions){
    if(!r.showLabel || state.completed.has(r.id)) continue;
    const x=r.label[0]*scale, y=r.label[1]*scale;
    ctx.strokeStyle="rgba(255,255,255,.9)";
    ctx.fillStyle="#4b4652";
    ctx.strokeText(String(r.n),x,y);
    ctx.fillText(String(r.n),x,y);
  }
}

function handlePaintClick(e){
  handlePaintPointer(e.clientX,e.clientY);
}

function handlePaintPointer(clientX,clientY){
  if(!template) return;
  const canvas=$("paintCanvas");
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((clientX-rect.left)/rect.width*template.width);
  const y=Math.floor((clientY-rect.top)/rect.height*template.height);
  if(x<0||y<0||x>=template.width||y>=template.height) return;
  const regionId=template.regionMap[y*template.width+x];
  if(regionId<0) return;
  paintRegion(regionId);
}

function paintRegion(regionId){
  const r=template.regions[regionId];
  if(!r || state.completed.has(r.id)) return;
  if(r.n !== state.selectedColor){
    showToast(`That area needs color #${r.n}`);
    return;
  }
  state.completed.add(r.id);
  state.undoStack.push(r.id);
  drawPaintCanvas();
  renderPalette();
  updateProgress();
  if(state.completed.size===template.regions.length) $("completeModal").classList.remove("hidden");
}

function renderPalette(){
  const t=template;
  $("palette").innerHTML=t.colors.map((color,idx)=>{
    const n=idx+1;
    const total=t.regions.filter(r=>r.n===n).length;
    const done=t.regions.filter(r=>r.n===n && state.completed.has(r.id)).length;
    return `<button class="swatch ${state.selectedColor===n?"active":""} ${total&&done===total?"done":""}" data-n="${n}">
      <div class="color-dot" style="background:${color}"></div><strong>#${n}</strong><span>${done}/${total}</span>
    </button>`;
  }).join("");
  $("palette").querySelectorAll(".swatch").forEach(btn=>btn.addEventListener("click",()=>{state.selectedColor=Number(btn.dataset.n);renderPalette();}));
}

function updateProgress(){
  if(!template) return;
  const pct=Math.round(state.completed.size/template.regions.length*100);
  $("progressText").textContent=`${pct}%`;
  $("progressBar").style.width=`${pct}%`;
}

function showHint(){
  const target=template?.regions.find(r=>r.n===state.selectedColor&&!state.completed.has(r.id));
  if(!target) return showToast("No unfinished areas for this color.");
  const old = colorPreview;
  colorPreview = true;
  drawPaintCanvas();
  setTimeout(()=>{colorPreview=old;drawPaintCanvas();},900);
}

function undo(){
  const last=state.undoStack.pop();
  if(last===undefined) return showToast("Nothing to undo.");
  state.completed.delete(last);
  drawPaintCanvas();
  renderPalette();
  updateProgress();
}

function resetCurrent(){
  state.completed.clear();
  state.undoStack=[];
  drawPaintCanvas();
  renderPalette();
  updateProgress();
  showToast("Painting reset.");
}

function showStudio(){
  $("paintView").classList.remove("active");
  $("studioView").classList.add("active");
  $("studioBtn").classList.add("hidden");
  $("completeModal").classList.add("hidden");
}

function setZoom(v){state.zoom=Math.max(.65,Math.min(3,v));applyTransform();}
function applyTransform(){$("canvasInner").style.transform=`translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;}
function showToast(m){const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1600);}
function colorDist(a,b){return(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
function rgbToHex([r,g,b]){return"#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
function nearestColorIndex(p, centers){let best=0,bestD=Infinity;centers.forEach((c,i)=>{const d=colorDist(p,c);if(d<bestD){bestD=d;best=i;}});return best;}

function smoothImageData(img,w,h,passes){
  let current=img;
  for(let p=0;p<passes;p++){
    const out=new ImageData(w,h);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let s=[0,0,0],c=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
          const i=(ny*w+nx)*4;s[0]+=current.data[i];s[1]+=current.data[i+1];s[2]+=current.data[i+2];c++;
        }
        const o=(y*w+x)*4;out.data[o]=s[0]/c;out.data[o+1]=s[1]/c;out.data[o+2]=s[2]/c;out.data[o+3]=255;
      }
    }
    current=out;
  }
  return current;
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
else init();
