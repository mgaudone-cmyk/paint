let uploadedImage = null;
let template = null;

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
  $("copyPromptBtn").addEventListener("click", copyPrompt);
  $("imageUpload").addEventListener("change", handleUpload);
  $("convertBtn").addEventListener("click", convertImage);
  $("studioBtn").addEventListener("click", showStudio);
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

function copyPrompt(){
  $("promptBox").select();
  document.execCommand("copy");
  showToast("Prompt copied.");
}

function handleUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const img = new Image();
  img.onload = () => {
    uploadedImage = img;
    drawOriginalPreview(img);
    showToast("Image loaded. Tap Convert.");
  };
  img.src = URL.createObjectURL(file);
}

function drawOriginalPreview(img){
  const canvas = $("originalCanvas");
  const ctx = canvas.getContext("2d");
  const maxW = 500;
  const ratio = img.height / img.width;
  canvas.width = maxW;
  canvas.height = Math.round(maxW * ratio);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
}

function convertImage(){
  if(!uploadedImage){
    showToast("Upload an image first.");
    return;
  }

  showToast("Converting image...");
  setTimeout(() => {
    const colorCount = Number($("colorCount").value);
    const detail = $("detailLevel").value;
    template = imageToPaintTemplate(uploadedImage, colorCount, detail);
    state.selectedColor = 1;
    state.completed = new Set();
    state.undoStack = [];
    state.zoom = 1;
    state.pan = {x:0,y:0};
    renderPreview(template);
    startPainting(template);
  }, 50);
}

function imageToPaintTemplate(img, colorCount, detail){
  const gridW = detail === "low" ? 42 : detail === "medium" ? 56 : 72;
  const ratio = img.height / img.width;
  const gridH = Math.max(42, Math.round(gridW * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = gridW;
  canvas.height = gridH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, gridW, gridH);
  const data = ctx.getImageData(0,0,gridW,gridH);

  const pixels = [];
  for(let i=0;i<data.data.length;i+=4){
    const r=data.data[i], g=data.data[i+1], b=data.data[i+2];
    pixels.push([r,g,b]);
  }

  const centers = kmeans(pixels, colorCount, 8);
  const labels = pixels.map(p => nearestColorIndex(p, centers));

  const regions = floodFillRegions(labels, gridW, gridH, centers);
  const minSize = detail === "low" ? 5 : detail === "medium" ? 4 : 3;
  const merged = mergeTinyRegions(regions, labels, gridW, gridH, minSize);

  const svgRegions = merged.map((reg, idx) => regionToSvg(reg, idx));
  const colors = centers.map(rgbToHex);

  return {
    title: "Princess Paint-by-Number",
    width: gridW,
    height: gridH,
    colors,
    regions: svgRegions
  };
}

function kmeans(pixels, k, iterations){
  const sample = [];
  const step = Math.max(1, Math.floor(pixels.length / (k * 20)));
  for(let i=0;i<pixels.length;i+=step) sample.push(pixels[i]);

  let centers = [];
  for(let i=0;i<k;i++){
    centers.push(sample[Math.floor((i / k) * (sample.length-1))] || sample[0] || [255,255,255]);
  }

  for(let iter=0;iter<iterations;iter++){
    const groups = Array.from({length:k},()=>({sum:[0,0,0],count:0}));
    for(const p of sample){
      const idx = nearestColorIndex(p, centers);
      groups[idx].sum[0]+=p[0]; groups[idx].sum[1]+=p[1]; groups[idx].sum[2]+=p[2]; groups[idx].count++;
    }
    centers = centers.map((c,i)=>{
      const g=groups[i];
      if(!g.count) return c;
      return [Math.round(g.sum[0]/g.count), Math.round(g.sum[1]/g.count), Math.round(g.sum[2]/g.count)];
    });
  }
  return centers;
}

function nearestColorIndex(p, centers){
  let best=0, bestD=Infinity;
  centers.forEach((c,i)=>{
    const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
    if(d<bestD){bestD=d;best=i;}
  });
  return best;
}

function floodFillRegions(labels,w,h,centers){
  const seen = new Uint8Array(w*h);
  const regions = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const start = y*w+x;
      if(seen[start]) continue;
      const color = labels[start];
      const stack = [[x,y]];
      const cells = [];
      seen[start]=1;

      while(stack.length){
        const [cx,cy]=stack.pop();
        cells.push([cx,cy]);
        for(const [dx,dy] of dirs){
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const ni=ny*w+nx;
          if(seen[ni]||labels[ni]!==color) continue;
          seen[ni]=1;
          stack.push([nx,ny]);
        }
      }
      regions.push({color:color+1,cells});
    }
  }
  return regions;
}

function mergeTinyRegions(regions, labels, w, h, minSize){
  // For performance and stability, keep tiny regions but hide labels on very small areas.
  return regions.filter(r => r.cells.length >= 1).map(r => ({...r, showLabel:r.cells.length>=minSize}));
}

function regionToSvg(region, idx){
  const cells = region.cells;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  cells.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});

  // Build a compound path from cells. This is blocky but follows actual image regions.
  // It is much higher-quality than fake character geometry because it comes from the source image.
  let d = "";
  cells.forEach(([x,y])=>{
    d += `M${x} ${y} H${x+1} V${y+1} H${x} Z `;
  });

  const labelX = (minX+maxX+1)/2;
  const labelY = (minY+maxY+1)/2;

  return {
    id:`r${idx}`,
    n:region.color,
    d,
    label:[labelX,labelY],
    showLabel:region.showLabel,
    size:cells.length
  };
}

function renderPreview(t){
  const canvas = $("previewCanvas");
  const ctx = canvas.getContext("2d");
  const scale = 8;
  canvas.width = t.width * scale;
  canvas.height = t.height * scale;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  t.regions.forEach(r=>{
    ctx.fillStyle = t.colors[r.n-1];
    // Parse path cells quickly from d is inefficient; use SVG preview instead not canvas.
  });

  // Easier: render a thumbnail using SVG as image-like preview.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  t.regions.forEach(r=>{
    ctx.fillStyle = t.colors[r.n-1];
    const commands = r.d.match(/M[0-9.]+ [0-9.]+ H[0-9.]+ V[0-9.]+ H[0-9.]+ Z/g) || [];
    for(const cmd of commands){
      const nums = cmd.match(/[0-9.]+/g).map(Number);
      const x=nums[0], y=nums[1];
      ctx.fillRect(x*scale,y*scale,scale,scale);
    }
  });
}

function startPainting(t){
  $("studioView").classList.remove("active");
  $("paintView").classList.add("active");
  $("studioBtn").classList.remove("hidden");
  $("completeModal").classList.add("hidden");
  $("artMeta").textContent = `${t.colors.length} colors · ${t.regions.length} regions · image-based`;
  renderCanvas();
  renderPalette();
  updateProgress();
  applyTransform();
}

function renderCanvas(){
  const t = template;
  const labelEls = t.regions
    .filter(r => !state.completed.has(r.id) && r.showLabel)
    .map(r => `<text class="region-label" x="${r.label[0]}" y="${r.label[1]}">${r.n}</text>`)
    .join("");

  $("canvasInner").innerHTML = `
    <svg class="paint-svg" viewBox="0 0 ${t.width} ${t.height}">
      ${t.regions.map(r=>{
        const done = state.completed.has(r.id);
        const fill = done ? t.colors[r.n-1] : "#fffaf4";
        return `<path class="region ${done?"filled":"unfilled"}" data-id="${r.id}" data-n="${r.n}" fill="${fill}" d="${r.d}" />`;
      }).join("")}
      ${labelEls}
    </svg>
  `;

  $("canvasInner").querySelectorAll(".region").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      paintRegion(el.dataset.id);
    });
  });
}

function renderPalette(){
  const t = template;
  $("palette").innerHTML = t.colors.map((color,idx)=>{
    const n=idx+1;
    const total=t.regions.filter(r=>r.n===n).length;
    const done=t.regions.filter(r=>r.n===n && state.completed.has(r.id)).length;
    return `<button class="swatch ${state.selectedColor===n?"active":""} ${total&&done===total?"done":""}" data-n="${n}">
      <div class="color-dot" style="background:${color}"></div>
      <strong>#${n}</strong>
      <span>${done}/${total}</span>
    </button>`;
  }).join("");

  $("palette").querySelectorAll(".swatch").forEach(btn=>{
    btn.addEventListener("click",()=>{
      state.selectedColor=Number(btn.dataset.n);
      renderPalette();
    });
  });
}

function paintRegion(id){
  const r = template.regions.find(x=>x.id===id);
  if(!r || state.completed.has(id)) return;

  if(r.n !== state.selectedColor){
    const el = $("canvasInner").querySelector(`[data-id="${id}"]`);
    if(el){
      el.classList.add("wrong");
      showToast(`That area needs color #${r.n}`);
      setTimeout(()=>{
        el.classList.remove("wrong");
        el.setAttribute("fill","#fffaf4");
      },300);
    }
    return;
  }

  state.completed.add(id);
  state.undoStack.push(id);
  renderCanvas();
  renderPalette();
  updateProgress();

  if(state.completed.size === template.regions.length){
    $("completeModal").classList.remove("hidden");
  }
}

function updateProgress(){
  if(!template) return;
  const total=template.regions.length;
  const done=state.completed.size;
  const pct=Math.round(done/total*100);
  $("progressText").textContent=`${pct}%`;
  $("progressBar").style.width=`${pct}%`;
}

function showHint(){
  const target = template?.regions.find(r=>r.n===state.selectedColor && !state.completed.has(r.id));
  if(!target) return showToast("No unfinished areas for this color.");
  const el = $("canvasInner").querySelector(`[data-id="${target.id}"]`);
  if(el){
    el.classList.add("hint");
    setTimeout(()=>el.classList.remove("hint"),2300);
  }
}

function undo(){
  const last=state.undoStack.pop();
  if(!last) return showToast("Nothing to undo.");
  state.completed.delete(last);
  renderCanvas();
  renderPalette();
  updateProgress();
}

function resetCurrent(){
  state.completed.clear();
  state.undoStack=[];
  renderCanvas();
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

function setZoom(v){
  state.zoom=Math.max(.65,Math.min(3,v));
  applyTransform();
}

function applyTransform(){
  $("canvasInner").style.transform=`translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

function showToast(m){
  const t=$("toast");
  t.textContent=m;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1600);
}

function rgbToHex([r,g,b]){
  return "#" + [r,g,b].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join("");
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
else init();
