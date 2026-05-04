let savedArtworks = JSON.parse(localStorage.getItem("paintquest:generated") || "[]");

let state = {
  currentTemplate: null,
  selectedColor: 1,
  completed: new Set(),
  undoStack: [],
  zoom: 1,
  pan: { x: 0, y: 0 },
  dragging: false,
  lastPoint: null
};

const $ = (id) => document.getElementById(id);

const palettes = {
  abstract: ["#ffbe0b","#fb5607","#ff006e","#8338ec","#3a86ff","#06d6a0","#ffd166","#118ab2","#ef476f","#073b4c","#f7ede2","#84a59d"],
  animal: ["#f2cc8f","#e07a5f","#3d405b","#81b29a","#f4f1de","#8d5524","#c68642","#ffffff","#2b2d42","#d9ed92","#b08968","#7f5539"],
  landscape: ["#2a9d8f","#264653","#e9c46a","#f4a261","#e76f51","#ffffff","#80ed99","#48cae4","#023e8a","#90be6d","#dda15e","#606c38"],
  flower: ["#ffafcc","#ffc8dd","#cdb4db","#bde0fe","#a2d2ff","#80ed99","#f72585","#7209b7","#fdfcdc","#f28482","#84a59d","#006d77"],
  mandala: ["#f72585","#b5179e","#7209b7","#560bad","#480ca8","#3a0ca3","#3f37c9","#4361ee","#4895ef","#4cc9f0","#ffbe0b","#06d6a0"],
  portrait: ["#f8d5b7","#e9b98f","#c68642","#8d5524","#3d2b1f","#ffffff","#e07a5f","#7f5539","#2b2d42","#b08968","#ffd7ba","#9d4edd"],
  fantasy: ["#7400b8","#6930c3","#5e60ce","#5390d9","#4ea8de","#48bfe3","#56cfe1","#64dfdf","#72efdd","#80ffdb","#ffd166","#ef476f"]
};

function init() {
  bindEvents();
  renderSavedGrid();
}

function bindEvents() {
  $("generateBtn").addEventListener("click", generateFromControls);
  $("galleryBtn").addEventListener("click", showGenerator);
  $("newVariantBtn").addEventListener("click", generateFromCurrentStyle);
  $("hintBtn").addEventListener("click", showHint);
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", resetCurrent);
  $("zoomInBtn").addEventListener("click", () => setZoom(state.zoom + 0.15));
  $("zoomOutBtn").addEventListener("click", () => setZoom(state.zoom - 0.15));
  $("modalGalleryBtn").addEventListener("click", showGenerator);
  $("imageUpload").addEventListener("change", handleImageUpload);

  const stage = $("canvasStage");
  stage.addEventListener("pointerdown", e => {
    state.dragging = true;
    state.lastPoint = { x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastPoint.x;
    const dy = e.clientY - state.lastPoint.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      state.pan.x += dx;
      state.pan.y += dy;
      state.lastPoint = { x: e.clientX, y: e.clientY };
      applyTransform();
    }
  });
  stage.addEventListener("pointerup", () => state.dragging = false);
}

function generateFromControls() {
  const type = $("artType").value;
  const difficulty = $("difficulty").value;
  const colorCount = Number($("colorCount").value);
  const template = generateArtwork(type, difficulty, colorCount);
  saveGenerated(template);
  startTemplate(template);
}

function generateFromCurrentStyle() {
  if (!state.currentTemplate) return;
  const type = state.currentTemplate.type || $("artType").value;
  const difficulty = state.currentTemplate.difficultyKey || $("difficulty").value;
  const colorCount = state.currentTemplate.colors.length;
  const template = generateArtwork(type, difficulty, colorCount);
  saveGenerated(template);
  startTemplate(template);
}

function generateArtwork(type, difficulty, colorCount) {
  const seed = Date.now();
  const colors = shuffle([...palettes[type]]).slice(0, colorCount);
  const regionCount = difficulty === "easy" ? 14 : difficulty === "medium" ? 24 : 40;

  let regions;
  if (type === "abstract") regions = generateAbstract(regionCount, colorCount);
  if (type === "animal") regions = generateAnimal(regionCount, colorCount);
  if (type === "landscape") regions = generateLandscape(regionCount, colorCount);
  if (type === "flower") regions = generateFlower(regionCount, colorCount);
  if (type === "mandala") regions = generateMandala(regionCount, colorCount);
  if (type === "portrait") regions = generatePortrait(regionCount, colorCount);
  if (type === "fantasy") regions = generateFantasy(regionCount, colorCount);

  return {
    id: `generated-${type}-${seed}`,
    title: titleCase(type) + " #" + String(seed).slice(-4),
    category: titleCase(type),
    type,
    difficulty: titleCase(difficulty),
    difficultyKey: difficulty,
    colors,
    viewBox: "0 0 420 420",
    regions
  };
}

function generateAbstract(count, colorCount) {
  const regions = [];
  const rows = Math.ceil(Math.sqrt(count));
  const cell = 420 / rows;
  let id = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < rows && id < count; x++) {
      const x0 = x * cell, y0 = y * cell;
      const wobble = rand(-18, 18);
      regions.push({
        id: `abs-${id}`,
        n: (id % colorCount) + 1,
        shape: "path",
        d: `M${x0} ${y0+wobble} L${x0+cell} ${y0+rand(-15,15)} L${x0+cell+rand(-12,12)} ${y0+cell} L${x0+rand(-12,12)} ${y0+cell+rand(-15,15)} Z`,
        label: [x0 + cell/2, y0 + cell/2]
      });
      id++;
    }
  }
  return regions;
}

function generateAnimal(count, colorCount) {
  const r = [
    { id:"body", n:1, shape:"ellipse", attrs:{cx:210,cy:235,rx:120,ry:100}, label:[210,235] },
    { id:"head", n:2, shape:"circle", attrs:{cx:210,cy:135,r:82}, label:[210,135] },
    { id:"ear-l", n:3, shape:"path", d:"M145 95 L105 25 L185 65 Z", label:[145,62] },
    { id:"ear-r", n:3, shape:"path", d:"M275 95 L315 25 L235 65 Z", label:[275,62] },
    { id:"eye-l", n:4, shape:"circle", attrs:{cx:180,cy:130,r:18}, label:[180,130] },
    { id:"eye-r", n:4, shape:"circle", attrs:{cx:240,cy:130,r:18}, label:[240,130] },
    { id:"nose", n:5, shape:"path", d:"M210 155 L190 180 L230 180 Z", label:[210,172] },
    { id:"belly", n:6, shape:"ellipse", attrs:{cx:210,cy:260,rx:65,ry:58}, label:[210,260] },
    { id:"tail", n:2, shape:"path", d:"M310 240 C395 210 390 330 315 310 C355 295 355 250 310 270 Z", label:[346,270] },
    { id:"paw-l", n:5, shape:"circle", attrs:{cx:160,cy:330,r:32}, label:[160,330] },
    { id:"paw-r", n:5, shape:"circle", attrs:{cx:260,cy:330,r:32}, label:[260,330] }
  ];
  return expandWithDecor(r, count, colorCount, "animal");
}

function generateLandscape(count, colorCount) {
  const r = [
    { id:"sky", n:1, shape:"path", d:"M0 0 H420 V175 C350 135 290 145 240 178 C175 220 110 158 0 205 Z", label:[80,80] },
    { id:"sun", n:2, shape:"circle", attrs:{cx:330,cy:78,r:43}, label:[330,78] },
    { id:"mountain-l", n:3, shape:"path", d:"M0 250 L120 100 L240 250 Z", label:[120,205] },
    { id:"mountain-r", n:4, shape:"path", d:"M180 260 L300 85 L420 260 Z", label:[300,210] },
    { id:"hill", n:5, shape:"path", d:"M0 245 C110 220 180 285 255 250 C325 220 370 245 420 275 V420 H0 Z", label:[200,330] },
    { id:"river", n:6, shape:"path", d:"M190 260 C220 315 185 360 230 420 H130 C150 360 165 315 150 270 Z", label:[178,350] }
  ];
  return expandWithDecor(r, count, colorCount, "landscape");
}

function generateFlower(count, colorCount) {
  const r = [
    { id:"center", n:1, shape:"circle", attrs:{cx:210,cy:185,r:40}, label:[210,185] },
    { id:"stem", n:2, shape:"path", d:"M200 220 C185 285 195 345 170 420 H220 C220 340 230 280 220 220 Z", label:[205,320] },
    { id:"leaf-l", n:3, shape:"path", d:"M190 300 C115 250 75 295 65 345 C125 365 170 345 190 300 Z", label:[125,320] },
    { id:"leaf-r", n:3, shape:"path", d:"M220 330 C295 275 350 315 355 365 C295 382 245 365 220 330 Z", label:[295,342] }
  ];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    const cx = 210 + Math.cos(a) * 75;
    const cy = 185 + Math.sin(a) * 75;
    r.push({ id:`petal-${i}`, n:(i % colorCount)+1, shape:"ellipse", attrs:{cx,cy,rx:32,ry:55,rot:a*180/Math.PI}, label:[cx,cy] });
  }
  return expandWithDecor(r, count, colorCount, "flower");
}

function generateMandala(count, colorCount) {
  const r = [];
  const rings = count > 30 ? 4 : 3;
  let id = 0;
  for (let ring = 0; ring < rings; ring++) {
    const pieces = ring === 0 ? 8 : ring === 1 ? 12 : 16;
    const r1 = 25 + ring * 45;
    const r2 = r1 + 42;
    for (let i = 0; i < pieces; i++) {
      const a1 = (Math.PI * 2 * i) / pieces;
      const a2 = (Math.PI * 2 * (i + 1)) / pieces;
      const p1 = polar(210,210,r1,a1), p2 = polar(210,210,r2,a1), p3 = polar(210,210,r2,a2), p4 = polar(210,210,r1,a2);
      const mid = polar(210,210,(r1+r2)/2,(a1+a2)/2);
      r.push({
        id:`man-${id++}`,
        n:(i + ring) % colorCount + 1,
        shape:"path",
        d:`M${p1.x} ${p1.y} L${p2.x} ${p2.y} A${r2} ${r2} 0 0 1 ${p3.x} ${p3.y} L${p4.x} ${p4.y} A${r1} ${r1} 0 0 0 ${p1.x} ${p1.y} Z`,
        label:[mid.x, mid.y]
      });
    }
  }
  r.push({ id:"mandala-center", n:1, shape:"circle", attrs:{cx:210,cy:210,r:24}, label:[210,210] });
  return r.slice(0, count);
}

function generatePortrait(count, colorCount) {
  const r = [
    { id:"background", n:7 % colorCount || 1, shape:"rect", attrs:{x:0,y:0,width:420,height:420}, label:[55,55] },
    { id:"hair", n:4, shape:"path", d:"M105 170 C95 45 325 45 315 170 C315 105 260 80 210 80 C155 80 105 110 105 170 Z", label:[210,82] },
    { id:"face", n:1, shape:"ellipse", attrs:{cx:210,cy:185,rx:88,ry:108}, label:[210,185] },
    { id:"neck", n:2, shape:"rect", attrs:{x:175,y:275,width:70,height:65}, label:[210,305] },
    { id:"shirt", n:5, shape:"path", d:"M120 420 C130 345 290 345 300 420 Z", label:[210,380] },
    { id:"eye-l", n:6, shape:"ellipse", attrs:{cx:178,cy:165,rx:18,ry:10}, label:[178,165] },
    { id:"eye-r", n:6, shape:"ellipse", attrs:{cx:242,cy:165,rx:18,ry:10}, label:[242,165] },
    { id:"nose", n:3, shape:"path", d:"M210 178 L195 225 L220 225 Z", label:[208,210] },
    { id:"mouth", n:8 % colorCount || 1, shape:"path", d:"M175 245 C200 265 225 265 250 245", label:[212,258] }
  ];
  return expandWithDecor(r, count, colorCount, "portrait");
}

function generateFantasy(count, colorCount) {
  const r = [
    { id:"night", n:1, shape:"rect", attrs:{x:0,y:0,width:420,height:420}, label:[55,55] },
    { id:"moon", n:2, shape:"circle", attrs:{cx:330,cy:80,r:42}, label:[330,80] },
    { id:"castle", n:3, shape:"path", d:"M110 420 V210 H145 V145 H185 V210 H230 V125 H275 V210 H310 V420 Z", label:[210,285] },
    { id:"dragon-body", n:4, shape:"path", d:"M50 260 C120 190 210 270 280 215 C340 170 390 220 370 275 C310 250 260 295 190 285 C120 275 85 300 50 260 Z", label:[210,250] },
    { id:"wing-l", n:5, shape:"path", d:"M175 230 L95 90 L240 190 Z", label:[165,170] },
    { id:"wing-r", n:6, shape:"path", d:"M245 225 L345 95 L300 245 Z", label:[300,180] },
    { id:"fire", n:7 % colorCount || 1, shape:"path", d:"M365 235 C390 215 405 240 420 220 V300 C395 280 380 310 360 285 Z", label:[390,260] }
  ];
  return expandWithDecor(r, count, colorCount, "fantasy");
}

function expandWithDecor(regions, count, colorCount, prefix) {
  let i = regions.length;
  while (i < count) {
    const x = rand(35, 385);
    const y = rand(35, 385);
    const size = rand(14, 32);
    regions.push({
      id: `${prefix}-decor-${i}`,
      n: (i % colorCount) + 1,
      shape: Math.random() > 0.5 ? "circle" : "ellipse",
      attrs: Math.random() > 0.5
        ? { cx:x, cy:y, r:size }
        : { cx:x, cy:y, rx:size, ry:Math.max(10, size * 0.65), rot:rand(0,180) },
      label: [x,y]
    });
    i++;
  }
  return regions;
}

function startTemplate(template) {
  state.currentTemplate = template;
  state.selectedColor = 1;
  state.undoStack = [];
  state.zoom = 1;
  state.pan = { x: 0, y: 0 };

  const saved = JSON.parse(localStorage.getItem(saveKey(template.id)) || "null");
  state.completed = new Set(saved?.completed || []);

  $("artTitle").textContent = template.title;
  $("artMeta").textContent = `${template.category} · ${template.difficulty} · ${template.colors.length} colors · ${template.regions.length} regions`;
  $("generatorView").classList.remove("active");
  $("paintView").classList.add("active");
  $("galleryBtn").classList.remove("hidden");

  renderCanvas();
  renderPalette();
  updateProgress();
  applyTransform();
}

function renderCanvas() {
  const t = state.currentTemplate;
  $("canvasInner").innerHTML = `
    <svg class="paint-svg" viewBox="${t.viewBox}">
      ${t.regions.map(r => {
        const isDone = state.completed.has(r.id);
        const fill = isDone ? t.colors[(r.n - 1) % t.colors.length] : "#f8f7f2";
        return shapeMarkup(r, fill, true, isDone);
      }).join("")}
      ${t.regions.filter(r => !state.completed.has(r.id)).map(r => `<text class="region-label" x="${r.label[0]}" y="${r.label[1]}">${r.n}</text>`).join("")}
    </svg>
  `;

  $("canvasInner").querySelectorAll(".region").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      paintRegion(el.dataset.id);
    });
  });
}

function shapeMarkup(r, fill, interactive = true, done = false) {
  const common = interactive
    ? `class="region ${done ? "filled" : "unfilled"}" data-id="${r.id}" data-n="${r.n}" fill="${fill}"`
    : `fill="${fill}" stroke="#fff" stroke-width="2"`;
  if (r.shape === "path") return `<path ${common} d="${r.d}" />`;
  if (r.shape === "circle") return `<circle ${common} cx="${r.attrs.cx}" cy="${r.attrs.cy}" r="${r.attrs.r}" />`;
  if (r.shape === "rect") return `<rect ${common} x="${r.attrs.x}" y="${r.attrs.y}" width="${r.attrs.width}" height="${r.attrs.height}" />`;
  if (r.shape === "ellipse") {
    const rot = r.attrs.rot || 0;
    return `<ellipse ${common} cx="${r.attrs.cx}" cy="${r.attrs.cy}" rx="${r.attrs.rx}" ry="${r.attrs.ry}" transform="rotate(${rot} ${r.attrs.cx} ${r.attrs.cy})" />`;
  }
  return "";
}

function renderPalette() {
  const t = state.currentTemplate;
  $("palette").innerHTML = t.colors.map((color, idx) => {
    const n = idx + 1;
    const total = t.regions.filter(r => r.n === n).length;
    const done = t.regions.filter(r => r.n === n && state.completed.has(r.id)).length;
    return `
      <button class="swatch ${state.selectedColor === n ? "active" : ""} ${total && done === total ? "done" : ""}" data-n="${n}">
        <div class="color-dot" style="background:${color}"></div>
        <strong>#${n}</strong>
        <span>${done}/${total}</span>
      </button>
    `;
  }).join("");
  $("palette").querySelectorAll(".swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedColor = Number(btn.dataset.n);
      renderPalette();
    });
  });
}

function paintRegion(id) {
  const t = state.currentTemplate;
  const region = t.regions.find(r => r.id === id);
  if (!region || state.completed.has(id)) return;

  if (region.n !== state.selectedColor) {
    const el = $("canvasInner").querySelector(`[data-id="${id}"]`);
    el.classList.add("wrong");
    showToast(`That area needs color #${region.n}`);
    setTimeout(() => {
      el.classList.remove("wrong");
      el.setAttribute("fill", "#f8f7f2");
    }, 300);
    return;
  }

  state.completed.add(id);
  state.undoStack.push(id);
  saveProgress();
  renderCanvas();
  renderPalette();
  updateProgress();

  if (state.completed.size === t.regions.length) {
    localStorage.removeItem(saveKey(t.id));
    $("completeModal").classList.remove("hidden");
  }
}

function updateProgress() {
  const total = state.currentTemplate.regions.length;
  const done = state.completed.size;
  const pct = Math.round((done / total) * 100);
  $("progressText").textContent = `${pct}%`;
  $("progressBar").style.width = `${pct}%`;
}

function showHint() {
  const target = state.currentTemplate.regions.find(r => r.n === state.selectedColor && !state.completed.has(r.id));
  if (!target) return showToast("No unfinished areas for this color.");
  const el = $("canvasInner").querySelector(`[data-id="${target.id}"]`);
  el.classList.add("hint");
  setTimeout(() => el.classList.remove("hint"), 2300);
}

function undo() {
  const last = state.undoStack.pop();
  if (!last) return showToast("Nothing to undo.");
  state.completed.delete(last);
  saveProgress();
  renderCanvas();
  renderPalette();
  updateProgress();
}

function resetCurrent() {
  if (!state.currentTemplate) return;
  state.completed.clear();
  state.undoStack = [];
  saveProgress();
  renderCanvas();
  renderPalette();
  updateProgress();
  showToast("Artwork reset.");
}

function saveProgress() {
  const t = state.currentTemplate;
  localStorage.setItem(saveKey(t.id), JSON.stringify({ completed: [...state.completed] }));
}

function saveKey(id) {
  return `paintquest:save:${id}`;
}

function saveGenerated(template) {
  savedArtworks.unshift(template);
  savedArtworks = savedArtworks.slice(0, 9);
  localStorage.setItem("paintquest:generated", JSON.stringify(savedArtworks));
  renderSavedGrid();
}

function renderSavedGrid() {
  const grid = $("savedGrid");
  if (!savedArtworks.length) {
    grid.innerHTML = `<p class="empty">No generated artworks yet.</p>`;
    return;
  }
  grid.innerHTML = savedArtworks.map(t => `
    <article class="template-card" data-id="${t.id}">
      ${thumbnailSVG(t)}
      <div class="template-info">
        <h4>${t.title}</h4>
        <p>${t.category} · ${t.difficulty} · ${t.colors.length} colors</p>
      </div>
    </article>
  `).join("");
  grid.querySelectorAll(".template-card").forEach(card => {
    card.addEventListener("click", () => {
      const t = savedArtworks.find(x => x.id === card.dataset.id);
      if (t) startTemplate(t);
    });
  });
}

function thumbnailSVG(t) {
  return `<svg viewBox="${t.viewBox}" aria-hidden="true">${t.regions.map(r => shapeMarkup(r, t.colors[(r.n - 1) % t.colors.length], false)).join("")}</svg>`;
}

function setZoom(value) {
  state.zoom = Math.max(0.65, Math.min(2.5, value));
  applyTransform();
}

function applyTransform() {
  $("canvasInner").style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

function showGenerator() {
  $("paintView").classList.remove("active");
  $("generatorView").classList.add("active");
  $("galleryBtn").classList.add("hidden");
  $("completeModal").classList.add("hidden");
  renderSavedGrid();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1400);
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const paletteSize = Number($("paletteSize").value);
    const custom = createGridTemplateFromImage(img, paletteSize);
    saveGenerated(custom);
    startTemplate(custom);
  };
  img.src = URL.createObjectURL(file);
}

function createGridTemplateFromImage(img, paletteSize) {
  const canvas = document.createElement("canvas");
  const size = 10;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const rawColors = [];
  for (let i = 0; i < data.length; i += 4) rawColors.push([data[i], data[i+1], data[i+2]]);

  const quantized = rawColors.map(([r,g,b]) => [Math.round(r/48)*48, Math.round(g/48)*48, Math.round(b/48)*48]);
  const counts = {};
  quantized.forEach(c => counts[c.join(",")] = (counts[c.join(",")] || 0) + 1);

  const paletteColors = Object.entries(counts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, paletteSize)
    .map(([key]) => key.split(",").map(Number));

  while (paletteColors.length < 2) paletteColors.push([240,240,240]);

  const regions = [];
  const cell = 42;
  quantized.forEach((c, idx) => {
    const x = idx % size;
    const y = Math.floor(idx / size);
    const nearest = nearestColorIndex(c, paletteColors) + 1;
    regions.push({
      id: `custom-${idx}`,
      n: nearest,
      shape: "rect",
      attrs: { x: x * cell, y: y * cell, width: cell, height: cell },
      label: [x * cell + cell / 2, y * cell + cell / 2]
    });
  });

  return {
    id: `custom-${Date.now()}`,
    title: "Custom Image",
    category: "Custom",
    type: "custom",
    difficulty: "Generated",
    difficultyKey: "medium",
    colors: paletteColors.map(rgbToHex),
    viewBox: "0 0 420 420",
    regions
  };
}

function nearestColorIndex(color, paletteColors) {
  let best = 0, bestDist = Infinity;
  paletteColors.forEach((p, idx) => {
    const d = (color[0]-p[0])**2 + (color[1]-p[1])**2 + (color[2]-p[2])**2;
    if (d < bestDist) { bestDist = d; best = idx; }
  });
  return best;
}

function rgbToHex([r,g,b]) {
  return "#" + [r,g,b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function polar(cx, cy, r, a) {
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

function rand(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

init();
