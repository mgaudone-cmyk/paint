let uploadedImage=null, template=null, colorPreview=false;

let state={selectedColor:1,completed:new Set(),undoStack:[],zoom:1,pan:{x:0,y:0},dragging:false,lastPoint:null};

const $=id=>document.getElementById(id);

function init(){
  $("imageUpload").addEventListener("change",handleUpload);
  ["cropZoom","cropX","cropY"].forEach(id=>$(id).addEventListener("input",()=>{drawCropPreview();invalidatePreview();}));
  ["imageMode","colorCount","detailLevel","edgeStrength"].forEach(id=>$(id).addEventListener("change",invalidatePreview));
  $("previewBtn").addEventListener("click",previewConversion);
  $("commitBtn").addEventListener("click",commitConversion);
  $("studioBtn").addEventListener("click",showStudio);
  $("fitBtn").addEventListener("click",fitToScreen);
  $("centerBtn").addEventListener("click",centerCanvas);
  $("sectionsBtn").addEventListener("click",()=>$("sectionNav").classList.toggle("hidden"));
  $("sectionNav").querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>jumpToSection(btn.dataset.pos)));
  $("togglePreviewBtn").addEventListener("click",()=>{colorPreview=!colorPreview;drawPaintCanvas();$("togglePreviewBtn").textContent=colorPreview?"Paint Mode":"Color Preview";});
  $("hintBtn").addEventListener("click",showHint);
  $("undoBtn").addEventListener("click",undo);
  $("resetBtn").addEventListener("click",resetCurrent);
  $("zoomInBtn").addEventListener("click",()=>setZoom(state.zoom+.18));
  $("zoomOutBtn").addEventListener("click",()=>setZoom(state.zoom-.18));
  $("modalStudioBtn").addEventListener("click",showStudio);
  const canvas=$("paintCanvas");
  canvas.addEventListener("click",e=>handlePaintPointer(e.clientX,e.clientY));
  canvas.addEventListener("touchend",e=>{e.preventDefault();const t=e.changedTouches[0];if(t)handlePaintPointer(t.clientX,t.clientY);},{passive:false});
}

function handleUpload(e){
  const file=e.target.files[0]; if(!file)return;
  const img=new Image();
  img.onload=()=>{uploadedImage=img;drawCropPreview();invalidatePreview();showToast("Image loaded. Preview when ready.");};
  img.src=URL.createObjectURL(file);
}

function invalidatePreview(){const b=$("commitBtn"); if(b)b.disabled=true;}

function getCropParams(){return{zoom:Number($("cropZoom").value),offsetX:Number($("cropX").value)/100,offsetY:Number($("cropY").value)/100};}

function drawCroppedToCanvas(destCanvas,size=700){
  if(!uploadedImage)return null;
  const img=uploadedImage,ctx=destCanvas.getContext("2d",{willReadFrequently:true});
  destCanvas.width=size; destCanvas.height=size;
  const {zoom,offsetX,offsetY}=getCropParams();
  const sourceSize=Math.min(img.width,img.height)/zoom;
  const centerX=img.width/2+offsetX*img.width*.35, centerY=img.height/2+offsetY*img.height*.35;
  const sx=Math.max(0,Math.min(img.width-sourceSize,centerX-sourceSize/2));
  const sy=Math.max(0,Math.min(img.height-sourceSize,centerY-sourceSize/2));
  ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
  ctx.drawImage(img,sx,sy,sourceSize,sourceSize,0,0,size,size);
  return destCanvas;
}

function drawCropPreview(){if(uploadedImage)drawCroppedToCanvas($("cropCanvas"),700);}

function previewConversion(){
  if(!uploadedImage)return showToast("Upload an image first.");
  showToast("Building edge-aware preview...");
  setTimeout(()=>{
    template=buildTemplate();
    state.selectedColor=1;state.completed=new Set();state.undoStack=[];colorPreview=false;
    drawPreview();
    $("commitBtn").disabled=false;
    showToast("Preview ready. Adjust or commit.");
  },60);
}

function commitConversion(){
  if(!template)return showToast("Preview first.");
  state.selectedColor=1;state.completed=new Set();state.undoStack=[];state.zoom=1;state.pan={x:0,y:0};colorPreview=false;
  $("togglePreviewBtn").textContent="Color Preview";
  startPainting();
  setTimeout(fitToScreen,80);
}

function buildTemplate(){
  const mode=$("imageMode").value, detail=$("detailLevel").value, edgeStrength=$("edgeStrength").value;
  const colorCount=Number($("colorCount").value);
  const size=detail==="simple"?180:detail==="balanced"?230:280;
  const work=document.createElement("canvas");drawCroppedToCanvas(work,size);
  const ctx=work.getContext("2d",{willReadFrequently:true});
  let img=ctx.getImageData(0,0,size,size);
  if(mode!=="lineart")img=smoothImageData(img,size,size,mode==="photo"?2:1);

  const edges=edgeMap(img,size,size,mode,edgeStrength);
  const palette=smartPaletteFromImage(img,edges,size,size,colorCount,mode);
  let labels=new Int16Array(size*size); labels.fill(-1);

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const idx=y*size+x;
      if(edges[idx])continue;
      const i=idx*4;
      labels[idx]=nearestColorIndex([img.data[i],img.data[i+1],img.data[i+2]],palette);
    }
  }

  labels=majoritySmooth(labels,edges,size,size,detail==="detailed"?1:2);
  let regions=edgeAwareRegions(labels,edges,size,size);
  regions=mergeSmallRegions(regions,labels,edges,size,size,detail);
  regions=computeRegionMeta(regions,detail,size);

  const regionMap=new Int32Array(size*size);regionMap.fill(-1);
  regions.forEach((r,i)=>r.cells.forEach(([x,y])=>regionMap[y*size+x]=i));

  return{width:size,height:size,colors:palette.map(rgbToHex),edges,regions,regionMap,mode,detail};
}

function edgeMap(img,w,h,mode,strength){
  const gray=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){const j=i*4;gray[i]=0.299*img.data[j]+0.587*img.data[j+1]+0.114*img.data[j+2];}
  const edges=new Uint8Array(w*h);
  const base=mode==="lineart"?95:mode==="anime"?75:55;
  const gradT=strength==="soft"?38:strength==="medium"?28:20;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx=y*w+x, i=idx*4;
      const lum=gray[idx], max=Math.max(img.data[i],img.data[i+1],img.data[i+2]), min=Math.min(img.data[i],img.data[i+1],img.data[i+2]);
      const gx=-gray[idx-w-1]-2*gray[idx-1]-gray[idx+w-1]+gray[idx-w+1]+2*gray[idx+1]+gray[idx+w+1];
      const gy=-gray[idx-w-1]-2*gray[idx-w]-gray[idx-w+1]+gray[idx+w-1]+2*gray[idx+w]+gray[idx+w+1];
      const grad=Math.sqrt(gx*gx+gy*gy);
      const blackLine=lum<base && (max-min<130||lum<55);
      if(blackLine||grad>gradT)edges[idx]=1;
    }
  }
  // thicken edges slightly for clean boundaries
  const thick=new Uint8Array(edges);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const idx=y*w+x;if(edges[idx]){thick[idx-1]=1;thick[idx+1]=1;thick[idx-w]=1;thick[idx+w]=1;}}
  return thick;
}

function smartPaletteFromImage(img,edges,w,h,k,mode){
  const bucket=mode==="lineart"?20:mode==="anime"?24:30;
  const map=new Map();
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=y*w+x;if(edges[idx])continue;
      const i=idx*4, p=[img.data[i],img.data[i+1],img.data[i+2]];
      const key=p.map(v=>Math.round(v/bucket)*bucket).join(",");
      map.set(key,(map.get(key)||0)+1);
    }
  }
  const sorted=[...map.entries()].map(([key,count])=>({rgb:key.split(",").map(Number),count})).sort((a,b)=>b.count-a.count);
  const centers=[];
  const minD=mode==="lineart"?520:mode==="anime"?700:950;
  for(const s of sorted){if(centers.length>=k)break;if(centers.every(c=>colorDist(c,s.rgb)>minD))centers.push(s.rgb);}
  while(centers.length<k&&sorted.length)centers.push(sorted[centers.length%sorted.length].rgb);
  while(centers.length<k)centers.push([245,245,245]);
  return centers;
}

function majoritySmooth(labels,edges,w,h,passes){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(let p=0;p<passes;p++){
    const copy=labels.slice();
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const idx=y*w+x;if(edges[idx]||copy[idx]<0)continue;
      const counts={};
      for(const [dx,dy] of dirs){const n=copy[(y+dy)*w+x+dx];if(n>=0)counts[n]=(counts[n]||0)+1;}
      let best=copy[idx],bc=0;for(const k in counts){if(counts[k]>bc){bc=counts[k];best=Number(k);}}
      if(bc>=5)labels[idx]=best;
    }
  }
  return labels;
}

function edgeAwareRegions(labels,edges,w,h){
  const seen=new Uint8Array(w*h),regions=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const start=y*w+x;if(seen[start]||edges[start]||labels[start]<0)continue;
    const color=labels[start],stack=[[x,y]],cells=[];seen[start]=1;
    while(stack.length){
      const [cx,cy]=stack.pop();cells.push([cx,cy]);
      for(const [dx,dy] of dirs){
        const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
        const ni=ny*w+nx;if(seen[ni]||edges[ni]||labels[ni]!==color)continue;
        seen[ni]=1;stack.push([nx,ny]);
      }
    }
    regions.push({n:color+1,cells});
  }
  return regions;
}

function mergeSmallRegions(regions,labels,edges,w,h,detail){
  const min=detail==="simple"?45:detail==="balanced"?30:18;
  return regions.filter(r=>r.cells.length>=min);
}

function computeRegionMeta(regions,detail,size){
  const labelMin=detail==="simple"?260:detail==="balanced"?170:110;
  return regions.map((r,i)=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    r.cells.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
    return{...r,id:i,label:[(minX+maxX+1)/2,(minY+maxY+1)/2],showLabel:r.cells.length>=labelMin,size:r.cells.length};
  });
}

function drawPreview(){
  const canvas=$("previewCanvas"),scale=Math.max(2,Math.floor(760/template.width));
  canvas.width=template.width*scale;canvas.height=template.height*scale;
  const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;
  drawTemplate(ctx,scale,true,true);
}

function startPainting(){
  $("studioView").classList.remove("active");$("paintView").classList.add("active");$("studioBtn").classList.remove("hidden");$("completeModal").classList.add("hidden");
  $("artMeta").textContent=`${template.colors.length} colors · ${template.regions.length} regions · edge-aware ${template.mode}`;
  drawPaintCanvas();renderPalette();updateProgress();applyTransform();
}

function drawPaintCanvas(){
  if(!template)return;
  const canvas=$("paintCanvas"),scale=Math.max(3,Math.floor(1000/template.width));
  canvas.width=template.width*scale;canvas.height=template.height*scale;
  const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;
  drawTemplate(ctx,scale,colorPreview,false);
}

function drawTemplate(ctx,scale,preview,thumbnail){
  const t=template;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,t.width*scale,t.height*scale);
  for(const r of t.regions){
    const done=state.completed.has(r.id);
    ctx.fillStyle=(preview||done)?t.colors[r.n-1]:"#fffdf8";
    for(const [x,y] of r.cells)ctx.fillRect(x*scale,y*scale,scale,scale);
  }
  ctx.fillStyle="#111";
  for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++)if(t.edges[y*t.width+x])ctx.fillRect(x*scale,y*scale,scale,scale);
  if(preview||thumbnail)return;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=`900 ${Math.max(10,scale*2.3)}px -apple-system,BlinkMacSystemFont,Arial`;
  ctx.lineWidth=3;
  for(const r of t.regions){
    if(!r.showLabel||state.completed.has(r.id))continue;
    const x=r.label[0]*scale,y=r.label[1]*scale;
    ctx.strokeStyle="rgba(255,255,255,.95)";ctx.fillStyle="#4b4652";
    ctx.strokeText(String(r.n),x,y);ctx.fillText(String(r.n),x,y);
  }
}

function handlePaintPointer(clientX,clientY){
  if(!template)return;
  const canvas=$("paintCanvas"),rect=canvas.getBoundingClientRect();
  const x=Math.floor((clientX-rect.left)/rect.width*template.width),y=Math.floor((clientY-rect.top)/rect.height*template.height);
  if(x<0||y<0||x>=template.width||y>=template.height)return;
  const id=template.regionMap[y*template.width+x];if(id<0)return;
  paintRegion(id);
}

function paintRegion(id){
  const r=template.regions[id];if(!r||state.completed.has(r.id))return;
  if(r.n!==state.selectedColor)return showToast(`That area needs color #${r.n}`);
  state.completed.add(r.id);state.undoStack.push(r.id);drawPaintCanvas();renderPalette();updateProgress();
  if(state.completed.size===template.regions.length)$("completeModal").classList.remove("hidden");
}

function renderPalette(){
  const t=template;
  $("palette").innerHTML=t.colors.map((color,idx)=>{
    const n=idx+1,total=t.regions.filter(r=>r.n===n).length,done=t.regions.filter(r=>r.n===n&&state.completed.has(r.id)).length;
    return`<button class="swatch ${state.selectedColor===n?"active":""} ${total&&done===total?"done":""}" data-n="${n}"><div class="color-dot" style="background:${color}"></div><strong>#${n}</strong><span>${done}/${total}</span></button>`;
  }).join("");
  $("palette").querySelectorAll(".swatch").forEach(btn=>btn.addEventListener("click",()=>{state.selectedColor=Number(btn.dataset.n);renderPalette();}));
}

function updateProgress(){if(!template)return;const pct=Math.round(state.completed.size/template.regions.length*100);$("progressText").textContent=`${pct}%`;$("progressBar").style.width=`${pct}%`;}
function showHint(){const r=template?.regions.find(r=>r.n===state.selectedColor&&!state.completed.has(r.id));if(!r)return showToast("No unfinished areas for this color.");const old=colorPreview;colorPreview=true;drawPaintCanvas();setTimeout(()=>{colorPreview=old;drawPaintCanvas();},900);}
function undo(){const last=state.undoStack.pop();if(last===undefined)return showToast("Nothing to undo.");state.completed.delete(last);drawPaintCanvas();renderPalette();updateProgress();}
function resetCurrent(){state.completed.clear();state.undoStack=[];drawPaintCanvas();renderPalette();updateProgress();showToast("Painting reset.");}
function showStudio(){$("paintView").classList.remove("active");$("studioView").classList.add("active");$("studioBtn").classList.add("hidden");$("completeModal").classList.add("hidden");}
function fitToScreen(){state.zoom=1;state.pan={x:0,y:0};applyTransform();}
function centerCanvas(){state.pan={x:0,y:0};applyTransform();}
function jumpToSection(pos){if(!template)return;const max=220*state.zoom;const map={tl:[max,max],tc:[0,max],tr:[-max,max],cl:[max,0],cc:[0,0],cr:[-max,0],bl:[max,-max],bc:[0,-max],br:[-max,-max]};state.pan={x:(map[pos]||[0,0])[0],y:(map[pos]||[0,0])[1]};if(state.zoom<1.5)state.zoom=1.5;applyTransform();}
function setZoom(v){state.zoom=Math.max(.65,Math.min(4.5,v));applyTransform();}
function applyTransform(){$("canvasInner").style.transform=`translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;}
function showToast(m){const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1600);}
function colorDist(a,b){return(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
function rgbToHex([r,g,b]){return"#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
function nearestColorIndex(p,centers){let best=0,bd=Infinity;centers.forEach((c,i)=>{const d=colorDist(p,c);if(d<bd){bd=d;best=i;}});return best;}
function smoothImageData(img,w,h,passes){let cur=img;for(let p=0;p<passes;p++){const out=new ImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=[0,0,0],c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const i=(ny*w+nx)*4;s[0]+=cur.data[i];s[1]+=cur.data[i+1];s[2]+=cur.data[i+2];c++;}const o=(y*w+x)*4;out.data[o]=s[0]/c;out.data[o+1]=s[1]/c;out.data[o+2]=s[2]/c;out.data[o+3]=255;}cur=out;}return cur;}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
