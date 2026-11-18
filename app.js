const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const DEFAULT_GRID_SIZE = 40;
const BASE_HOP_PX = DEFAULT_GRID_SIZE * 2;
const BASE_HOP_KM = 1.5;
const AVG_METRO_SPEED_KMH = 40;
const TRANSFER_MINUTES = 3.5;
const DEFAULT_SETTINGS = {
gridSize: 40,
lineWidth: 8,
showGrid: true,
snapToGrid: true,
animations: true,
stubStations: false,
lineBadges: true,
riverBridges: true,
smartLabels: true,
darkTheme: false,
bgOpacity: 0.45,
bgScale: 1
};
const DEMO_PRESET_ID = 'builtin_demo_v1';
const DEMO_STATE = {
stations: Array.of(
{ id: 1001, x: -160, y: 0, name: 'Западная' },
{ id: 1002, x: -80, y: 0, name: 'Центральная' },
{ id: 1003, x: 0, y: 0, name: 'Речной вокзал' },
{ id: 1004, x: 80, y: 0, name: 'Восточная' },
{ id: 1005, x: -80, y: -80, name: 'Северная' },
{ id: 1006, x: -80, y: 80, name: 'Южная' },
{ id: 1007, x: 0, y: -80, name: 'Парк Победы' },
{ id: 1008, x: 0, y: 40, name: 'Набережная' },
{ id: 1009, x: 80, y: 80, name: 'Университет' }
),
segments: Array.of(
{ id: 2001, from: 1001, to: 1002, color: '#ef4444', cp: null },
{ id: 2002, from: 1002, to: 1003, color: '#ef4444', cp: null },
{ id: 2003, from: 1003, to: 1004, color: '#ef4444', cp: null },
{ id: 2004, from: 1005, to: 1002, color: '#3b82f6', cp: null },
{ id: 2005, from: 1002, to: 1006, color: '#3b82f6', cp: null },
{ id: 2006, from: 1007, to: 1008, color: '#22c55e', cp: null },
{ id: 2007, from: 1008, to: 1009, color: '#22c55e', cp: { x: 20, y: 80 } }
),
transfers: Array.of(
{ id: 3001, from: 1003, to: 1008 }
),
rivers: Array.of(
Array.of(
{ x: 40, y: -130 },
{ x: 35, y: -30 },
{ x: 50, y: 40 },
{ x: 30, y: 130 }
)
),
lineNames: {
'#ef4444': 'Красная линия',
'#3b82f6': 'Синяя линия',
'#22c55e': 'Зелёная линия'
},
lineCodes: {
'#ef4444': '1',
'#3b82f6': '2',
'#22c55e': '3'
},
bgImage: null
};
let state = {
stations: Array.of(),
segments: Array.of(),
transfers: Array.of(),
rivers: Array.of(),
lineNames: {},
lineCodes: {},
bgImage: null
};
let savedPresets = Array.of();
let history = Array.of();
let settings = Object.assign({}, DEFAULT_SETTINGS);
let cam = { x: innerWidth / 2, y: innerHeight / 2, zoom: 1 };
let tool = 'line';
let color = '#ef4444';
let panning = false;
let panStart = { x: 0, y: 0 };
let space = false;
let activeSt = null;
let dragSt = null;
let dragSeg = null;
let curRiver = null;
let mouseW = { x: 0, y: 0 };
let bgImgObj = null;
let routeStartId = null;
let activeRoute = null;
let routeAnimProgress = 1;
let routeAnimRaf = null;
let rulerStart = null;
let rulerEnd = null;
let rulerLocked = false;
let renderedBadges = Array.of();
let timelapse = {
active: false,
recording: false,
rafId: null,
steps: Array.of(),
stepIndex: 0,
stepProgress: 0,
holdFrames: 0,
recorder: null,
chunks: Array.of()
};
function cloneData(obj) {
return JSON.parse(JSON.stringify(obj));
}
function syncBgImageObject(dataUrl) {
if (!dataUrl) {
bgImgObj = null;
updateBgControlsUI();
draw();
return;
}
const img = new Image();
img.onload = () => {
bgImgObj = img;
updateBgControlsUI();
draw();
};
img.src = dataUrl;
}
function updateBgControlsUI() {
const hasBg = Boolean(state.bgImage);
const block = document.getElementById('bgSettingsBlock');
const btn = document.getElementById('uploadBgBtn');
if (block) block.classList.toggle('hidden', !hasBg);
if (btn) btn.classList.toggle('active', hasBg);
}
function normalizeState(raw) {
return {
stations: Array.isArray(raw.stations) ? raw.stations : Array.of(),
segments: Array.isArray(raw.segments) ? raw.segments : Array.of(),
transfers: Array.isArray(raw.transfers) ? raw.transfers : Array.of(),
rivers: Array.isArray(raw.rivers) ? raw.rivers : Array.of(),
lineNames: raw.lineNames && typeof raw.lineNames === 'object' ? raw.lineNames : {},
lineCodes: raw.lineCodes && typeof raw.lineCodes === 'object' ? raw.lineCodes : {},
bgImage: typeof raw.bgImage === 'string' ? raw.bgImage : null
};
}
function persistState() {
try {
localStorage.setItem('metro_v1', JSON.stringify(state));
} catch (e) {
try {
const liteState = Object.assign({}, state, { bgImage: null });
localStorage.setItem('metro_v1', JSON.stringify(liteState));
} catch (err) {}
}
}
function buildBuiltinDemoEntry() {
return {
id: DEMO_PRESET_ID,
name: '🚇 Демо-схема (Стандарт)',
builtin: true,
updatedAt: 'Встроенный пресет',
state: cloneData(DEMO_STATE)
};
}
function persistPresets() {
try {
localStorage.setItem('metro_presets_v1', JSON.stringify(savedPresets));
} catch (e) {
try {
const liteList = savedPresets.map(p => Object.assign({}, p, {
state: Object.assign({}, p.state, { bgImage: null })
}));
localStorage.setItem('metro_presets_v1', JSON.stringify(liteList));
} catch (err) {}
}
}
function loadPresetsFromStorage() {
let list = Array.of();
try {
const raw = localStorage.getItem('metro_presets_v1');
if (raw) {
const parsed = JSON.parse(raw);
if (Array.isArray(parsed)) list = parsed;
}
} catch (e) {}
const withoutDemo = list.filter(p => p && p.id !== DEMO_PRESET_ID);
savedPresets = Array.of(buildBuiltinDemoEntry()).concat(withoutDemo);
persistPresets();
}
function registerPresetInSaves(name, targetState, targetSettings = null) {
const cleanName = (name || 'Без названия').trim();
const normalized = normalizeState(cloneData(targetState));
const entry = {
id: 'preset_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
name: cleanName,
builtin: false,
updatedAt: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
settings: targetSettings ? cloneData(targetSettings) : cloneData(settings),
state: normalized
};
const withoutDemo = savedPresets.filter(p => p && p.id !== DEMO_PRESET_ID && p.name !== cleanName);
savedPresets = Array.of(buildBuiltinDemoEntry(), entry).concat(withoutDemo);
persistPresets();
renderSavesList();
}
function applyPresetToCanvas(presetId) {
const found = savedPresets.find(p => p.id === presetId);
if (!found) return;
if (timelapse.active) stopTimelapse();
saveSnapshot();
state = normalizeState(cloneData(found.state));
syncBgImageObject(state.bgImage);
if (found.settings) {
settings = Object.assign({}, DEFAULT_SETTINGS, found.settings);
saveSettings();
applySettingsToUI();
}
activeSt = null;
clearRoute();
clearRuler();
persistState();
updateLegendUI();
draw();
}
function deletePresetFromSaves(presetId) {
if (presetId === DEMO_PRESET_ID) return;
savedPresets = savedPresets.filter(p => p.id !== presetId);
persistPresets();
renderSavesList();
}
function renderSavesList() {
const container = document.getElementById('savesList') || document.getElementById('presetsList');
if (!container) return;
container.innerHTML = '';
savedPresets.forEach((item, idx) => {
const row = document.createElement('div');
row.className = 'save-item preset-item';
row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--border);margin-bottom:8px;background:var(--panel);';
const info = document.createElement('div');
info.style.cssText = 'text-align:left;overflow:hidden;flex:1;';
const title = document.createElement('div');
title.style.cssText = 'font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
title.textContent = (idx + 1) + '. ' + item.name;
const meta = document.createElement('div');
meta.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px;';
const stCount = item.state && Array.isArray(item.state.stations) ? item.state.stations.length : 0;
const segCount = item.state && Array.isArray(item.state.segments) ? item.state.segments.length : 0;
meta.textContent = 'Станций: ' + stCount + ' • Перегонов: ' + segCount + ' • ' + (item.updatedAt || '');
info.appendChild(title);
info.appendChild(meta);
const btns = document.createElement('div');
btns.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
const loadBtn = document.createElement('button');
loadBtn.className = 'tool-btn active';
loadBtn.textContent = '▶ Открыть';
loadBtn.addEventListener('click', () => {
applyPresetToCanvas(item.id);
const modal = document.getElementById('savesModal') || document.getElementById('presetsModal');
if (modal) modal.classList.add('hidden');
const menu = document.getElementById('mainMenu');
if (menu) menu.classList.add('hidden');
});
btns.appendChild(loadBtn);
if (!item.builtin) {
const delBtn = document.createElement('button');
delBtn.className = 'tool-btn';
delBtn.style.color = '#ef4444';
delBtn.textContent = '🗑';
delBtn.title = 'Удалить сохранение';
delBtn.addEventListener('click', () => {
if (confirm('Удалить сохранение «' + item.name + '»?')) {
deletePresetFromSaves(item.id);
}
});
btns.appendChild(delBtn);
}
row.appendChild(info);
row.appendChild(btns);
container.appendChild(row);
});
}
window.loadPresetById = applyPresetToCanvas;
window.saveCurrentAsPreset = customName => {
const name = customName || prompt('Название сохранения:', 'Моя схема ' + savedPresets.length);
if (name !== null && name.trim()) {
registerPresetInSaves(name.trim(), state, settings);
}
};
function resize() {
canvas.width = innerWidth;
canvas.height = innerHeight;
draw();
}
addEventListener('resize', resize);
function saveSnapshot() {
history.push(JSON.stringify(state));
if (history.length > 40) history.shift();
}
function saveSettings() {
try { localStorage.setItem('metro_settings_v1', JSON.stringify(settings)); } catch (e) {}
}
// Инициализация при запуске: загружаем пресеты и ставим Демо при первом заходе
loadPresetsFromStorage();
try {
const saved = localStorage.getItem('metro_v1');
if (saved) {
state = normalizeState(JSON.parse(saved));
if (state.bgImage) syncBgImageObject(state.bgImage);
} else {
state = normalizeState(cloneData(DEMO_STATE));
persistState();
}
const savedSet = localStorage.getItem('metro_settings_v1');
if (savedSet) settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(savedSet));
} catch (e) {
state = normalizeState(cloneData(DEMO_STATE));
}
function applySettingsToUI() {
const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
const setChk = (id, chk) => { const el = document.getElementById(id); if (el) el.checked = chk; };
setVal('gridSizeInput', settings.gridSize);
setTxt('gridSizeVal', settings.gridSize + ' px');
setVal('lineWidthInput', settings.lineWidth);
setTxt('lineWidthVal', settings.lineWidth + ' px');
setChk('showGridInput', settings.showGrid);
setChk('snapGridInput', settings.snapToGrid);
setChk('animationsInput', settings.animations);
setChk('stubStationsInput', settings.stubStations);
setChk('lineBadgesInput', settings.lineBadges);
setChk('riverBridgesInput', settings.riverBridges);
setChk('smartLabelsInput', settings.smartLabels);
setChk('darkThemeInput', settings.darkTheme);
setVal('bgOpacityInput', settings.bgOpacity);
setTxt('bgOpacityVal', Math.round(settings.bgOpacity * 100) + '%');
setVal('bgScaleInput', settings.bgScale);
setTxt('bgScaleVal', Math.round(settings.bgScale * 100) + '%');
const snapBtn = document.getElementById('snapToggleBtn');
if (snapBtn) snapBtn.classList.toggle('active', settings.snapToGrid);
document.body.classList.toggle('dark', settings.darkTheme);
updateBgControlsUI();
}
function toggleSnap() {
settings.snapToGrid = !settings.snapToGrid;
applySettingsToUI();
saveSettings();
draw();
}
function clearRoute() {
if (routeAnimRaf) {
cancelAnimationFrame(routeAnimRaf);
routeAnimRaf = null;
}
routeStartId = null;
activeRoute = null;
routeAnimProgress = 1;
const panel = document.getElementById('routePanel');
if (panel) panel.classList.add('hidden');
}
function startRouteAnimation() {
if (routeAnimRaf) cancelAnimationFrame(routeAnimRaf);
if (!activeRoute || !settings.animations) {
routeAnimProgress = 1;
draw();
return;
}
routeAnimProgress = 0;
const totalEdges = Math.max(activeRoute.edges.length, 1);
const durationMs = Math.min(Math.max(totalEdges * 260, 500), 3200);
const startTime = performance.now();
function step(now) {
const t = Math.min((now - startTime) / durationMs, 1);
routeAnimProgress = t;
draw();
if (t < 1 && activeRoute) {
routeAnimRaf = requestAnimationFrame(step);
} else {
routeAnimRaf = null;
}
}
routeAnimRaf = requestAnimationFrame(step);
}
function clearRuler() {
rulerStart = null;
rulerEnd = null;
rulerLocked = false;
}
function stopTimelapse() {
if (timelapse.rafId) {
cancelAnimationFrame(timelapse.rafId);
timelapse.rafId = null;
}
if (timelapse.recorder && timelapse.recorder.state !== 'inactive') {
try { timelapse.recorder.stop(); } catch (e) {}
}
timelapse.active = false;
timelapse.recording = false;
timelapse.steps = Array.of();
const tlBtn = document.getElementById('timelapseBtn');
const recBtn = document.getElementById('recordVideoBtn');
if (tlBtn) {
tlBtn.classList.remove('active');
tlBtn.textContent = '🎬 Таймлапс';
}
if (recBtn) {
recBtn.classList.remove('active');
recBtn.textContent = '⏺ Видео';
}
draw();
}
function buildChronologySteps() {
const items = Array.of();
state.segments.forEach(seg => {
items.push({ kind: 'segment', time: Number(seg.id) || 0, data: seg });
});
state.transfers.forEach(tr => {
items.push({ kind: 'transfer', time: Number(tr.id) || 0, data: tr });
});
const linkedStationIds = new Set();
state.segments.forEach(s => { linkedStationIds.add(s.from); linkedStationIds.add(s.to); });
state.transfers.forEach(t => { linkedStationIds.add(t.from); linkedStationIds.add(t.to); });
state.stations.forEach(st => {
if (!linkedStationIds.has(st.id)) {
items.push({ kind: 'station', time: Number(st.id) || 0, data: st });
}
});
items.sort((a, b) => a.time - b.time);
return items;
}
function startTimelapse(withRecording = false) {
if (timelapse.active) {
stopTimelapse();
return;
}
const steps = buildChronologySteps();
if (!steps.length) {
alert('Сначала постройте хотя бы одну ветку метро, чтобы запустить хронологию.');
return;
}
activeSt = null;
clearRoute();
clearRuler();
timelapse.active = true;
timelapse.recording = withRecording;
timelapse.steps = steps;
timelapse.stepIndex = 0;
timelapse.stepProgress = settings.animations ? 0 : 1;
timelapse.holdFrames = 0;
const tlBtn = document.getElementById('timelapseBtn');
const recBtn = document.getElementById('recordVideoBtn');
if (tlBtn) {
tlBtn.classList.add('active');
tlBtn.textContent = '⏹ Стоп';
}
if (withRecording) {
if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
alert('Ваш браузер не поддерживает запись видео с холста.');
stopTimelapse();
return;
}
try {
timelapse.chunks = Array.of();
const stream = canvas.captureStream(60);
const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
const recorder = new MediaRecorder(stream, { mimeType: mime });
recorder.ondataavailable = ev => {
if (ev.data && ev.data.size > 0) timelapse.chunks.push(ev.data);
};
recorder.onstop = () => {
if (timelapse.chunks.length > 0) {
const blob = new Blob(timelapse.chunks, { type: 'video/webm' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.download = 'metro-timelapse.webm';
a.href = url;
a.click();
URL.revokeObjectURL(url);
}
timelapse.chunks = Array.of();
};
timelapse.recorder = recorder;
recorder.start();
if (recBtn) {
recBtn.classList.add('active');
recBtn.textContent = '🔴 Запись...';
}
} catch (err) {
alert('Не удалось запустить запись видео.');
stopTimelapse();
return;
}
}
let lastTime = performance.now();
const stepDuration = settings.animations ? 340 : 160;
function tick(now) {
if (!timelapse.active) return;
const dt = now - lastTime;
lastTime = now;
if (timelapse.stepIndex < timelapse.steps.length) {
timelapse.stepProgress += dt / stepDuration;
if (timelapse.stepProgress >= 1) {
timelapse.stepIndex++;
timelapse.stepProgress = 0;
}
draw();
timelapse.rafId = requestAnimationFrame(tick);
} else {
timelapse.holdFrames++;
draw();
if (timelapse.holdFrames < 90) {
timelapse.rafId = requestAnimationFrame(tick);
} else {
stopTimelapse();
}
}
}
draw();
timelapse.rafId = requestAnimationFrame(tick);
}
function undo() {
if (timelapse.active) stopTimelapse();
if (!history.length) return;
const prevBg = state.bgImage;
state = normalizeState(JSON.parse(history.pop()));
if (state.bgImage !== prevBg) syncBgImageObject(state.bgImage);
activeSt = null;
clearRoute();
persistState();
updateLegendUI();
draw();
}
const toWorld = (sx, sy) => ({ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom });
function snapGrid(p) {
if (!settings.snapToGrid) return { x: Math.round(p.x), y: Math.round(p.y) };
return {
x: Math.round(p.x / settings.gridSize) * settings.gridSize,
y: Math.round(p.y / settings.gridSize) * settings.gridSize
};
}
function snapAngle(a, b) {
if (!settings.snapToGrid) return { x: Math.round(b.x), y: Math.round(b.y) };
const dx = b.x - a.x;
const dy = b.y - a.y;
const d = Math.hypot(dx, dy);
if (d < 10) return a;
const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
return snapGrid({ x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d });
}
const hitSt = (p, r = 24) => state.stations.find(s => Math.hypot(s.x - p.x, s.y - p.y) <= r);
const stColorsFromSegs = (id, segsList) => Array.from(new Set(segsList.filter(g => g.from === id || g.to === id).map(g => g.color)));
function evalQuadPoint(p0, cp, p2, t) {
const mt = 1 - t;
return {
x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p2.x,
y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p2.y
};
}
function tracePartialCurve(p0, cp, p2, progress) {
const t = Math.max(0, Math.min(1, progress));
ctx.moveTo(p0.x, p0.y);
if (t <= 0) return p0;
if (!cp) {
const end = { x: p0.x + (p2.x - p0.x) * t, y: p0.y + (p2.y - p0.y) * t };
ctx.lineTo(end.x, end.y);
return end;
}
if (t >= 1) {
ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
return p2;
}
const q0 = { x: p0.x + (cp.x - p0.x) * t, y: p0.y + (cp.y - p0.y) * t };
const q1 = { x: cp.x + (p2.x - cp.x) * t, y: cp.y + (p2.y - cp.y) * t };
const r0 = { x: q0.x + (q1.x - q0.x) * t, y: q0.y + (q1.y - q0.y) * t };
ctx.quadraticCurveTo(q0.x, q0.y, r0.x, r0.y);
return r0;
}
function distToSegment(p, a, b) {
const dx = b.x - a.x;
const dy = b.y - a.y;
const lenSq = dx * dx + dy * dy;
if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
t = Math.max(0, Math.min(1, t));
return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToSegmentObj(p, seg) {
const s1 = state.stations.find(s => s.id === seg.from);
const s2 = state.stations.find(s => s.id === seg.to);
if (!s1 || !s2) return Infinity;
if (!seg.cp) return distToSegment(p, s1, s2);
let minD = Infinity;
let prev = s1;
const steps = 16;
for (let i = 1; i <= steps; i++) {
const cur = evalQuadPoint(s1, seg.cp, s2, i / steps);
const d = distToSegment(p, prev, cur);
if (d < minD) minD = d;
prev = cur;
}
return minD;
}
function segmentLengthPx(seg) {
const s1 = state.stations.find(s => s.id === seg.from);
const s2 = state.stations.find(s => s.id === seg.to);
if (!s1 || !s2) return 0;
if (!seg.cp) return Math.hypot(s2.x - s1.x, s2.y - s1.y);
let total = 0;
let prev = s1;
const steps = 16;
for (let i = 1; i <= steps; i++) {
const cur = evalQuadPoint(s1, seg.cp, s2, i / steps);
total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
prev = cur;
}
return total;
}
function worldPxToMetrics(px) {
const hops = px / BASE_HOP_PX;
const km = hops * BASE_HOP_KM;
const metroMins = (km / AVG_METRO_SPEED_KMH) * 60;
return { hops, km, metroMins };
}
const DEFAULT_COLOR_NAMES = new Map(Array.of(
Array.of('#ef4444', 'Красная линия'),
Array.of('#3b82f6', 'Синяя линия'),
Array.of('#22c55e', 'Зелёная линия'),
Array.of('#eab308', 'Жёлтая линия'),
Array.of('#a855f7', 'Фиолетовая линия'),
Array.of('#ec4899', 'Розовая линия')
));
function getActiveLines(segsSource = state.segments) {
const uniqueColors = Array.from(new Set(segsSource.map(s => s.color)));
return uniqueColors.map((col, idx) => {
const customName = Object.prototype.hasOwnProperty.call(state.lineNames, col) ? Reflect.get(state.lineNames, col) : '';
const customCode = Object.prototype.hasOwnProperty.call(state.lineCodes, col) ? Reflect.get(state.lineCodes, col) : '';
const fallback = DEFAULT_COLOR_NAMES.get(col.toLowerCase()) || ('Линия ' + (idx + 1));
return {
index: idx + 1,
code: customCode || String(idx + 1),
color: col,
name: customName || fallback
};
});
}
function promptRenameLineCode(lineColor, currentCode) {
const next = prompt('Номер или короткий код линии (например, 1, А1, МЦД-2):', currentCode);
if (next !== null) {
saveSnapshot();
const trimmed = next.trim().slice(0, 5);
const copy = Object.assign({}, state.lineCodes);
if (trimmed) {
Reflect.set(copy, lineColor, trimmed);
} else {
Reflect.deleteProperty(copy, lineColor);
}
state.lineCodes = copy;
persistState();
updateLegendUI();
draw();
}
}
function updateLegendUI() {
const panel = document.getElementById('legendPanel');
const list = document.getElementById('legendList');
if (!panel || !list) return;
const lines = getActiveLines();
if (!lines.length) {
panel.classList.add('hidden');
list.innerHTML = '';
return;
}
panel.classList.remove('hidden');
list.innerHTML = '';
lines.forEach(line => {
const item = document.createElement('div');
item.className = 'legend-item';
item.title = 'Нажмите, чтобы переименовать ветку';
const swatch = document.createElement('span');
swatch.className = 'legend-swatch';
swatch.style.background = line.color;
const label = document.createElement('span');
label.className = 'legend-name';
label.textContent = line.code + '. ' + line.name;
item.appendChild(swatch);
item.appendChild(label);
item.addEventListener('click', () => {
const next = prompt('Название линии метро:', line.name);
if (next !== null) {
saveSnapshot();
const trimmed = next.trim();
const copy = Object.assign({}, state.lineNames);
if (trimmed) {
Reflect.set(copy, line.color, trimmed);
} else {
Reflect.deleteProperty(copy, line.color);
}
state.lineNames = copy;
persistState();
updateLegendUI();
draw();
}
});
list.appendChild(item);
});
}
function buildAdjacencyGraph() {
const adj = new Map();
state.stations.forEach(st => adj.set(st.id, Array.of()));
state.segments.forEach(seg => {
if (!adj.has(seg.from) || !adj.has(seg.to)) return;
adj.get(seg.from).push({ to: seg.to, type: 'segment', color: seg.color, seg });
adj.get(seg.to).push({ to: seg.from, type: 'segment', color: seg.color, seg });
});
state.transfers.forEach(tr => {
if (!adj.has(tr.from) || !adj.has(tr.to)) return;
adj.get(tr.from).push({ to: tr.to, type: 'transfer', color: null, seg: null });
adj.get(tr.to).push({ to: tr.from, type: 'transfer', color: null, seg: null });
});
return adj;
}
function findShortestRoute(startId, endId) {
if (startId === endId) return null;
const adj = buildAdjacencyGraph();
const queue = Array.of(startId);
const visited = new Set(Array.of(startId));
const parent = new Map();
while (queue.length > 0) {
const curr = queue.shift();
if (curr === endId) break;
const neighbors = adj.get(curr) || Array.of();
for (const edge of neighbors) {
if (!visited.has(edge.to)) {
visited.add(edge.to);
parent.set(edge.to, { prevId: curr, edge });
queue.push(edge.to);
}
}
}
if (!visited.has(endId)) return null;
const edges = Array.of();
const stationIds = new Set(Array.of(startId, endId));
let curr = endId;
while (curr !== startId) {
const step = parent.get(curr);
edges.unshift({ from: step.prevId, to: curr, type: step.edge.type, color: step.edge.color, seg: step.edge.seg });
stationIds.add(step.prevId);
curr = step.prevId;
}
return { stationIds, edges };
}
function showRouteSummary(startSt, endSt, route) {
const panel = document.getElementById('routePanel');
const title = document.getElementById('routeTitle');
const details = document.getElementById('routeDetails');
if (!panel || !title || !details) return;
panel.classList.remove('hidden');
if (!route) {
title.textContent = '🧭 ' + startSt.name + ' → ' + endSt.name;
details.textContent = 'Путь не найден: станции не связаны ветками или переходами.';
return;
}
let stops = 0;
let transfersCount = 0;
let totalPx = 0;
const transferNotes = Array.of();
let prevColor = null;
route.edges.forEach(edge => {
const fromSt = state.stations.find(s => s.id === edge.from);
const toSt = state.stations.find(s => s.id === edge.to);
if (edge.seg) {
totalPx += segmentLengthPx(edge.seg);
} else if (fromSt && toSt) {
totalPx += Math.hypot(toSt.x - fromSt.x, toSt.y - fromSt.y);
}
if (edge.type === 'transfer') {
transfersCount++;
if (fromSt) transferNotes.push('переход на ст. «' + fromSt.name + '»');
prevColor = null;
} else {
stops++;
if (prevColor && edge.color && prevColor !== edge.color) {
transfersCount++;
if (fromSt) transferNotes.push('пересадка на ст. «' + fromSt.name + '»');
}
prevColor = edge.color;
}
});
const metrics = worldPxToMetrics(totalPx);
const totalMinutes = Math.max(1, Math.round(metrics.metroMins + stops * 0.5 + transfersCount * TRANSFER_MINUTES));
const distText = metrics.km.toFixed(1) + ' км';
title.textContent = '🧭 ' + startSt.name + ' → ' + endSt.name + ' (~' + totalMinutes + ' мин)';
const extra = transferNotes.length ? ' • ' + transferNotes.join(', ') : ' • без пересадок';
details.textContent = 'Дистанция: ~' + distText + ' • Перегонов: ' + stops + ' • Пересадок: ' + transfersCount + extra;
}
function boxesOverlap(a, b) {
return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}
function getIncidentVectors(st, segsList, trsList) {
const vecs = Array.of();
segsList.forEach(seg => {
let other = null;
if (seg.from === st.id) other = state.stations.find(s => s.id === seg.to);
else if (seg.to === st.id) other = state.stations.find(s => s.id === seg.from);
if (!other) return;
const target = seg.cp || other;
const ang = Math.atan2(target.y - st.y, target.x - st.x);
vecs.push({ angle: ang, color: seg.color, type: 'segment' });
});
trsList.forEach(tr => {
let other = null;
if (tr.from === st.id) other = state.stations.find(s => s.id === tr.to);
else if (tr.to === st.id) other = state.stations.find(s => s.id === tr.from);
if (!other) return;
const ang = Math.atan2(other.y - st.y, other.x - st.x);
vecs.push({ angle: ang, color: null, type: 'transfer' });
});
return vecs;
}
function angularClearance(targetAngle, incidentAngles) {
if (!incidentAngles.length) return Math.PI;
let minDiff = Math.PI;
incidentAngles.forEach(a => {
let diff = Math.abs(targetAngle - a) % (Math.PI * 2);
if (diff > Math.PI) diff = Math.PI * 2 - diff;
if (diff < minDiff) minDiff = diff;
});
return minDiff;
}
function computeSmartLabel(st, r, placedBoxes, segsList, trsList) {
ctx.font = '600 13px system-ui, sans-serif';
const textW = ctx.measureText(st.name).width;
const textH = 15;
const pad = r + 9;
if (!settings.smartLabels) {
return {
x: st.x,
y: st.y - pad,
align: 'center',
baseline: 'bottom',
angle: 0,
dir: -Math.PI / 2,
box: { x1: st.x - textW / 2, y1: st.y - pad - textH, x2: st.x + textW / 2, y2: st.y - pad }
};
}
const incidentAngles = getIncidentVectors(st, segsList, trsList).map(v => v.angle);
const candidates = Array.of(
{ dx: 0, dy: -pad, align: 'center', baseline: 'bottom', angle: 0, dir: -Math.PI / 2, prio: 0 },
{ dx: 0, dy: pad, align: 'center', baseline: 'top', angle: 0, dir: Math.PI / 2, prio: 1 },
{ dx: pad, dy: 0, align: 'left', baseline: 'middle', angle: 0, dir: 0, prio: 2 },
{ dx: -pad, dy: 0, align: 'right', baseline: 'middle', angle: 0, dir: Math.PI, prio: 3 },
{ dx: pad * 0.8, dy: -pad * 0.8, align: 'left', baseline: 'bottom', angle: -Math.PI / 4, dir: -Math.PI / 4, prio: 4 },
{ dx: pad * 0.8, dy: pad * 0.8, align: 'left', baseline: 'top', angle: 0, dir: Math.PI / 4, prio: 5 },
{ dx: -pad * 0.8, dy: -pad * 0.8, align: 'right', baseline: 'bottom', angle: 0, dir: -3 * Math.PI / 4, prio: 6 },
{ dx: -pad * 0.8, dy: pad * 0.8, align: 'right', baseline: 'top', angle: -Math.PI / 4, dir: 3 * Math.PI / 4, prio: 7 }
);
let best = null;
let bestScore = -Infinity;
candidates.forEach(c => {
const lx = st.x + c.dx;
const ly = st.y + c.dy;
let box;
if (c.angle === 0) {
const x1 = c.align === 'center' ? lx - textW / 2 : (c.align === 'left' ? lx : lx - textW);
const y1 = c.baseline === 'middle' ? ly - textH / 2 : (c.baseline === 'bottom' ? ly - textH : ly);
box = { x1: x1 - 3, y1: y1 - 2, x2: x1 + textW + 3, y2: y1 + textH + 2 };
} else {
const diag = textW * 0.72;
const x1 = c.align === 'left' ? lx : lx - diag;
const y1 = c.baseline === 'bottom' ? ly - diag - 6 : ly - 4;
box = { x1: x1 - 3, y1: y1 - 2, x2: x1 + diag + 6, y2: y1 + diag + 8 };
}
let overlaps = 0;
placedBoxes.forEach(pb => {
if (boxesOverlap(box, pb)) overlaps++;
});
const clearance = angularClearance(c.dir, incidentAngles);
const linePenalty = clearance < 0.35 ? 40 : 0;
const score = clearance * 25 - overlaps * 120 - linePenalty - c.prio * 1.5;
if (score > bestScore) {
bestScore = score;
best = { x: lx, y: ly, align: c.align, baseline: c.baseline, angle: c.angle, dir: c.dir, box };
}
});
return best;
}
function lineSegmentsIntersect(a, b, c, d) {
const ccw = (p1, p2, p3) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
if (ccw(a, c, d) === ccw(b, c, d) || ccw(a, b, c) === ccw(a, b, d)) return null;
const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
if (Math.abs(denom) < 0.0001) return null;
const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
return {
x: a.x + t * (b.x - a.x),
y: a.y + t * (b.y - a.y),
angle: Math.atan2(b.y - a.y, b.x - a.x)
};
}
function drawRiverBridges(lWidth, dark, segsList) {
if (!settings.riverBridges || !state.rivers.length || !segsList.length) return;
segsList.forEach(seg => {
const s1 = state.stations.find(s => s.id === seg.from);
const s2 = state.stations.find(s => s.id === seg.to);
if (!s1 || !s2) return;
const poly = Array.of(s1);
const steps = seg.cp ? 12 : 1;
for (let i = 1; i <= steps; i++) {
poly.push(seg.cp ? evalQuadPoint(s1, seg.cp, s2, i / steps) : s2);
}
for (let i = 0; i < poly.length - 1; i++) {
const a = poly.at(i);
const b = poly.at(i + 1);
state.rivers.forEach(rv => {
if (!rv || rv.length < 2) return;
for (let j = 0; j < rv.length - 1; j++) {
const hit = lineSegmentsIntersect(a, b, rv.at(j), rv.at(j + 1));
if (!hit) continue;
ctx.save();
ctx.translate(hit.x, hit.y);
ctx.rotate(hit.angle);
const bridgeLen = 46;
const halfW = lWidth / 2 + 5;
ctx.fillStyle = dark ? '#0f172a' : '#f4f6f8';
ctx.fillRect(-bridgeLen / 2, -halfW, bridgeLen, halfW * 2);
ctx.strokeStyle = dark ? '#94a3b8' : '#475569';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(-bridgeLen / 2 - 4, -halfW - 3);
ctx.lineTo(-bridgeLen / 2, -halfW);
ctx.lineTo(bridgeLen / 2, -halfW);
ctx.lineTo(bridgeLen / 2 + 4, -halfW - 3);
ctx.moveTo(-bridgeLen / 2 - 4, halfW + 3);
ctx.lineTo(-bridgeLen / 2, halfW);
ctx.lineTo(bridgeLen / 2, halfW);
ctx.lineTo(bridgeLen / 2 + 4, halfW + 3);
ctx.stroke();
ctx.restore();
}
});
}
});
}
function drawTransferBridge(s1, s2, lWidth, dark, isPreview = false, progress = 1) {
ctx.save();
if (isPreview) ctx.globalAlpha = 0.6;
ctx.lineCap = 'round';
const endPt = {
x: s1.x + (s2.x - s1.x) * progress,
y: s1.y + (s2.y - s1.y) * progress
};
ctx.strokeStyle = dark ? '#94a3b8' : '#334155';
ctx.lineWidth = lWidth + 6;
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(endPt.x, endPt.y);
ctx.stroke();
ctx.strokeStyle = dark ? '#0f172a' : '#ffffff';
ctx.lineWidth = Math.max(lWidth - 2, 4);
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(endPt.x, endPt.y);
ctx.stroke();
ctx.restore();
}
function drawRulerOverlay(dark) {
if (!rulerStart) return;
const endPt = rulerLocked && rulerEnd ? rulerEnd : (hitSt(mouseW) || mouseW);
const pxDist = Math.hypot(endPt.x - rulerStart.x, endPt.y - rulerStart.y);
const m = worldPxToMetrics(pxDist);
const mins = Math.max(0, Math.round(m.metroMins));
ctx.save();
ctx.strokeStyle = '#f59e0b';
ctx.lineWidth = 2.5 / cam.zoom;
ctx.setLineDash(Array.of(8 / cam.zoom, 6 / cam.zoom));
ctx.beginPath();
ctx.moveTo(rulerStart.x, rulerStart.y);
ctx.lineTo(endPt.x, endPt.y);
ctx.stroke();
ctx.setLineDash(Array.of());
ctx.fillStyle = '#f59e0b';
ctx.beginPath();
ctx.arc(rulerStart.x, rulerStart.y, 4.5 / cam.zoom, 0, Math.PI * 2);
ctx.arc(endPt.x, endPt.y, 4.5 / cam.zoom, 0, Math.PI * 2);
ctx.fill();
const midX = (rulerStart.x + endPt.x) / 2;
const midY = (rulerStart.y + endPt.y) / 2;
const label = m.km.toFixed(2) + ' км • ' + m.hops.toFixed(1) + ' перег. (~' + mins + ' мин)';
ctx.translate(midX, midY);
ctx.scale(1 / cam.zoom, 1 / cam.zoom);
ctx.font = '600 12px system-ui, sans-serif';
const tw = ctx.measureText(label).width;
ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)';
ctx.strokeStyle = '#f59e0b';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.roundRect(-tw / 2 - 10, -28, tw + 20, 22, 8);
ctx.fill();
ctx.stroke();
ctx.fillStyle = dark ? '#fbbf24' : '#b45309';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(label, 0, -17);
ctx.restore();
}
function drawScaleBar(dark) {
let mult = 1;
let screenPx = BASE_HOP_PX * cam.zoom;
while (screenPx < 60) {
mult *= 2;
screenPx = BASE_HOP_PX * mult * cam.zoom;
}
while (screenPx > 200 && mult > 0.25) {
mult /= 2;
screenPx = BASE_HOP_PX * mult * cam.zoom;
}
const km = (BASE_HOP_KM * mult).toFixed(mult < 1 ? 2 : 1);
const hopsText = mult === 1 ? '1 перегон' : (mult + ' перег.');
const caption = km + ' км (' + hopsText + ')';
const x = 16;
const y = canvas.height - 62;
ctx.save();
ctx.fillStyle = dark ? 'rgba(30, 41, 59, 0.82)' : 'rgba(255, 255, 255, 0.85)';
ctx.strokeStyle = dark ? '#334155' : '#cbd5e1';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(x, y - 24, Math.max(screenPx + 24, 130), 34, 9);
ctx.fill();
ctx.stroke();
const barX = x + 12;
const barY = y + 2;
ctx.strokeStyle = dark ? '#f8fafc' : '#1e293b';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(barX, barY - 4);
ctx.lineTo(barX, barY);
ctx.lineTo(barX + screenPx, barY);
ctx.lineTo(barX + screenPx, barY - 4);
ctx.stroke();
ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
ctx.font = '600 11px system-ui, sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'bottom';
ctx.fillText(caption, barX, barY - 5);
ctx.restore();
}
function drawLineEndpointBadges(lWidth, dark, hasRoute, segsList) {
renderedBadges = Array.of();
if (!settings.lineBadges) return;
const lines = getActiveLines(segsList);
const codeByColor = new Map();
lines.forEach(l => codeByColor.set(l.color, l.code));
const badgeR = Math.max(lWidth + 6, 13);
lines.forEach(line => {
const colSegments = segsList.filter(s => s.color === line.color);
if (!colSegments.length) return;
const degree = new Map();
colSegments.forEach(seg => {
degree.set(seg.from, (degree.get(seg.from) || 0) + 1);
degree.set(seg.to, (degree.get(seg.to) || 0) + 1);
});
degree.forEach((deg, stId) => {
if (deg !== 1) return;
const st = state.stations.find(s => s.id === stId);
const seg = colSegments.find(s => s.from === stId || s.to === stId);
if (!st || !seg) return;
const otherId = seg.from === stId ? seg.to : seg.from;
const otherSt = state.stations.find(s => s.id === otherId);
if (!otherSt) return;
const refPt = seg.cp || otherSt;
const outAngle = Math.atan2(st.y - refPt.y, st.x - refPt.x);
const offsetDist = lWidth + badgeR + 12;
const bx = st.x + Math.cos(outAngle) * offsetDist;
const by = st.y + Math.sin(outAngle) * offsetDist;
renderedBadges.push({ x: bx, y: by, r: badgeR, color: line.color, code: line.code });
ctx.save();
if (hasRoute) ctx.globalAlpha = 0.35;
ctx.strokeStyle = line.color;
ctx.lineWidth = Math.max(lWidth * 0.55, 3);
ctx.beginPath();
ctx.moveTo(st.x, st.y);
ctx.lineTo(bx, by);
ctx.stroke();
ctx.fillStyle = line.color;
ctx.beginPath();
ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
ctx.fill();
ctx.lineWidth = 2;
ctx.strokeStyle = dark ? '#0f172a' : '#ffffff';
ctx.stroke();
const code = codeByColor.get(line.color) || line.code;
const fontSize = code.length <= 2 ? 12 : (code.length === 3 ? 10 : 8.5);
ctx.fillStyle = '#ffffff';
ctx.font = '800 ' + fontSize + 'px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(code, bx, by + 0.5);
ctx.restore();
});
});
}
function drawTimelapseHUD(dark) {
if (!timelapse.active) return;
const total = Math.max(timelapse.steps.length, 1);
const done = Math.min(timelapse.stepIndex, total);
const pct = Math.round((done / total) * 100);
const statusText = timelapse.recording
? ('🔴 ЗАПИСЬ ВИДЕО • Хронология: ' + done + ' / ' + total + ' (' + pct + '%)')
: ('🎬 ХРОНОЛОГИЯ • Этап: ' + done + ' / ' + total + ' (' + pct + '%)');
ctx.save();
ctx.font = '700 12px system-ui, sans-serif';
const tw = ctx.measureText(statusText).width;
const x = canvas.width / 2 - tw / 2 - 16;
const y = 76;
ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.94)';
ctx.strokeStyle = timelapse.recording ? '#ef4444' : '#3b82f6';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.roundRect(x, y, tw + 32, 30, 10);
ctx.fill();
ctx.stroke();
ctx.fillStyle = timelapse.recording ? '#ef4444' : (dark ? '#f8fafc' : '#1e293b');
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(statusText, canvas.width / 2, y + 15);
ctx.restore();
}
function draw() {
const dark = document.body.classList.contains('dark');
const gSize = settings.gridSize;
const lWidth = settings.lineWidth;
let visibleSegs = state.segments;
let visibleTrs = state.transfers;
let visibleStations = state.stations;
let activeAnimStep = null;
if (timelapse.active) {
visibleSegs = Array.of();
visibleTrs = Array.of();
const visibleStIds = new Set();
const completedCount = Math.min(timelapse.stepIndex, timelapse.steps.length);
for (let i = 0; i < completedCount; i++) {
const item = timelapse.steps.at(i);
if (item.kind === 'segment') {
visibleSegs.push(item.data);
visibleStIds.add(item.data.from);
visibleStIds.add(item.data.to);
} else if (item.kind === 'transfer') {
visibleTrs.push(item.data);
visibleStIds.add(item.data.from);
visibleStIds.add(item.data.to);
} else if (item.kind === 'station') {
visibleStIds.add(item.data.id);
}
}
if (timelapse.stepIndex < timelapse.steps.length) {
activeAnimStep = timelapse.steps.at(timelapse.stepIndex);
if (activeAnimStep.kind === 'segment' || activeAnimStep.kind === 'transfer') {
visibleStIds.add(activeAnimStep.data.from);
if (timelapse.stepProgress > 0.75) visibleStIds.add(activeAnimStep.data.to);
} else if (activeAnimStep.kind === 'station') {
visibleStIds.add(activeAnimStep.data.id);
}
}
visibleStations = state.stations.filter(s => visibleStIds.has(s.id));
}
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.save();
ctx.translate(cam.x, cam.y);
ctx.scale(cam.zoom, cam.zoom);
if (bgImgObj && bgImgObj.complete && bgImgObj.naturalWidth > 0) {
ctx.save();
ctx.globalAlpha = settings.bgOpacity;
const w = bgImgObj.naturalWidth * settings.bgScale;
const h = bgImgObj.naturalHeight * settings.bgScale;
ctx.drawImage(bgImgObj, -w / 2, -h / 2, w, h);
ctx.restore();
}
if (settings.showGrid) {
const sx = Math.floor((-cam.x / cam.zoom) / gSize) * gSize - gSize;
const ex = sx + canvas.width / cam.zoom + gSize * 2;
const sy = Math.floor((-cam.y / cam.zoom) / gSize) * gSize - gSize;
const ey = sy + canvas.height / cam.zoom + gSize * 2;
ctx.strokeStyle = dark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(226, 232, 240, 0.85)';
ctx.lineWidth = 1 / cam.zoom;
ctx.beginPath();
for (let x = sx; x < ex; x += gSize) { ctx.moveTo(x, sy); ctx.lineTo(x, ey); }
for (let y = sy; y < ey; y += gSize) { ctx.moveTo(sx, y); ctx.lineTo(ex, y); }
ctx.stroke();
}
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
const riversList = curRiver ? state.rivers.concat(Array.of(curRiver)) : state.rivers;
riversList.forEach(rv => {
if (!rv || rv.length < 2) return;
ctx.strokeStyle = dark ? '#0284c7' : '#bae6fd';
ctx.lineWidth = 36;
ctx.beginPath();
rv.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
ctx.stroke();
});
drawRiverBridges(lWidth, dark, visibleSegs);
visibleTrs.forEach(tr => {
const s1 = state.stations.find(s => s.id === tr.from);
const s2 = state.stations.find(s => s.id === tr.to);
if (!s1 || !s2) return;
drawTransferBridge(s1, s2, lWidth, dark, false, 1);
});
if (activeAnimStep && activeAnimStep.kind === 'transfer') {
const tr = activeAnimStep.data;
const s1 = state.stations.find(s => s.id === tr.from);
const s2 = state.stations.find(s => s.id === tr.to);
if (s1 && s2) drawTransferBridge(s1, s2, lWidth, dark, false, timelapse.stepProgress);
}
if (!timelapse.active && tool === 'transfer' && activeSt) {
const target = hitSt(mouseW) || mouseW;
drawTransferBridge(activeSt, target, lWidth, dark, true, 1);
}
const hasRoute = Boolean(!timelapse.active && activeRoute && activeRoute.edges.length > 0);
const pairs = new Map();
visibleSegs.forEach(g => {
const s1 = state.stations.find(s => s.id === g.from);
const s2 = state.stations.find(s => s.id === g.to);
if (!s1 || !s2) return;
const k = g.from < g.to ? g.from + '' + g.to : g.to + '' + g.from;
const idx = pairs.get(k) || 0;
pairs.set(k, idx + 1);
const ang = Math.atan2(s2.y - s1.y, s2.x - s1.x);
const off = idx ? (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * lWidth : 0;
const ox = -Math.sin(ang) * off;
const oy = Math.cos(ang) * off;
ctx.save();
if (hasRoute) ctx.globalAlpha = 0.25;
ctx.strokeStyle = g.color;
ctx.lineWidth = lWidth;
ctx.beginPath();
ctx.moveTo(s1.x + ox, s1.y + oy);
if (g.cp) {
ctx.quadraticCurveTo(g.cp.x + ox, g.cp.y + oy, s2.x + ox, s2.y + oy);
} else {
ctx.lineTo(s2.x + ox, s2.y + oy);
}
ctx.stroke();
if (dragSeg && dragSeg.id === g.id && g.cp) {
ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
ctx.beginPath();
ctx.arc(g.cp.x, g.cp.y, 4 / cam.zoom, 0, Math.PI * 2);
ctx.fill();
}
ctx.restore();
});
if (activeAnimStep && activeAnimStep.kind === 'segment') {
const g = activeAnimStep.data;
const s1 = state.stations.find(s => s.id === g.from);
const s2 = state.stations.find(s => s.id === g.to);
if (s1 && s2) {
ctx.save();
ctx.strokeStyle = g.color;
ctx.lineWidth = lWidth;
ctx.beginPath();
const headPt = tracePartialCurve(s1, g.cp, s2, timelapse.stepProgress);
ctx.stroke();
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(headPt.x, headPt.y, lWidth * 0.45, 0, Math.PI * 2);
ctx.fill();
ctx.restore();
}
}
if (hasRoute) {
const totalEdges = activeRoute.edges.length;
const scaledProgress = routeAnimProgress * totalEdges;
let trainHead = null;
activeRoute.edges.forEach((edge, idx) => {
const edgeProgress = Math.max(0, Math.min(1, scaledProgress - idx));
if (edgeProgress <= 0) return;
const s1 = state.stations.find(s => s.id === edge.from);
const s2 = state.stations.find(s => s.id === edge.to);
if (!s1 || !s2) return;
const cp = edge.seg ? edge.seg.cp : null;
ctx.save();
ctx.lineCap = 'round';
ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(37, 99, 235, 0.3)';
ctx.lineWidth = lWidth + 10;
ctx.beginPath();
tracePartialCurve(s1, cp, s2, edgeProgress);
ctx.stroke();
ctx.strokeStyle = edge.color || (dark ? '#f8fafc' : '#2563eb');
ctx.lineWidth = lWidth + 2;
ctx.beginPath();
const headPt = tracePartialCurve(s1, cp, s2, edgeProgress);
ctx.stroke();
ctx.restore();
if (edgeProgress < 1 || idx === totalEdges - 1) {
trainHead = headPt;
}
});
if (trainHead && routeAnimProgress < 1) {
ctx.save();
ctx.fillStyle = '#ffffff';
ctx.strokeStyle = '#2563eb';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.arc(trainHead.x, trainHead.y, lWidth * 0.65 + 2, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();
ctx.restore();
}
}
if (!timelapse.active && tool === 'line' && activeSt) {
const t = hitSt(mouseW) || snapAngle(activeSt, mouseW);
ctx.strokeStyle = color;
ctx.globalAlpha = 0.55;
ctx.lineWidth = lWidth;
ctx.beginPath();
ctx.moveTo(activeSt.x, activeSt.y);
ctx.lineTo(t.x, t.y);
ctx.stroke();
ctx.globalAlpha = 1;
}
drawLineEndpointBadges(lWidth, dark, hasRoute, visibleSegs);
const stationRadii = new Map();
const labelLayouts = new Map();
const placedBoxes = Array.of();
visibleStations.forEach(st => {
const cols = stColorsFromSegs(st.id, visibleSegs);
const r = cols.length > 1 ? lWidth + 5 : lWidth + 1;
stationRadii.set(st.id, r);
placedBoxes.push({ x1: st.x - r - 2, y1: st.y - r - 2, x2: st.x + r + 2, y2: st.y + r + 2 });
});
visibleStations.forEach(st => {
if (!st.name) return;
const r = stationRadii.get(st.id) || lWidth + 2;
const lbl = computeSmartLabel(st, r, placedBoxes, visibleSegs, visibleTrs);
placedBoxes.push(lbl.box);
labelLayouts.set(st.id, lbl);
});
visibleStations.forEach(st => {
const cols = stColorsFromSegs(st.id, visibleSegs);
const r = stationRadii.get(st.id) || lWidth + 1;
const incidentSegs = visibleSegs.filter(g => g.from === st.id || g.to === st.id);
const hasTransfer = visibleTrs.some(tr => tr.from === st.id || tr.to === st.id);
const isStub = settings.stubStations && cols.length === 1 && incidentSegs.length === 2 && !hasTransfer;
const isDimmed = hasRoute && !activeRoute.stationIds.has(st.id);
ctx.save();
if (isDimmed) ctx.globalAlpha = 0.3;
if (isStub) {
const segA = incidentSegs.at(0);
const segB = incidentSegs.at(1);
const otherA = state.stations.find(s => s.id === (segA.from === st.id ? segA.to : segA.from));
const otherB = state.stations.find(s => s.id === (segB.from === st.id ? segB.to : segB.from));
let tangentAng = 0;
if (otherA && otherB) {
const refA = segA.cp || otherA;
const refB = segB.cp || otherB;
tangentAng = Math.atan2(refB.y - refA.y, refB.x - refA.x);
}
const lbl = labelLayouts.get(st.id);
const targetDir = lbl ? lbl.dir : -Math.PI / 2;
const perp1 = tangentAng + Math.PI / 2;
const perp2 = tangentAng - Math.PI / 2;
const diff1 = Math.abs(Math.atan2(Math.sin(perp1 - targetDir), Math.cos(perp1 - targetDir)));
const diff2 = Math.abs(Math.atan2(Math.sin(perp2 - targetDir), Math.cos(perp2 - targetDir)));
const stubDir = diff1 <= diff2 ? perp1 : perp2;
const stubLen = lWidth + 5;
ctx.strokeStyle = cols.at(0) || color;
ctx.lineWidth = Math.max(lWidth * 0.65, 4);
ctx.lineCap = 'butt';
ctx.beginPath();
ctx.moveTo(st.x, st.y);
ctx.lineTo(st.x + Math.cos(stubDir) * stubLen, st.y + Math.sin(stubDir) * stubLen);
ctx.stroke();
} else {
ctx.fillStyle = dark ? '#0f172a' : '#fff';
ctx.beginPath();
ctx.arc(st.x, st.y, r + 3, 0, Math.PI * 2);
ctx.fill();
if (cols.length <= 1) {
ctx.strokeStyle = cols.at(0) || color;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
ctx.stroke();
} else {
const step = (Math.PI * 2) / cols.length;
cols.forEach((c, i) => {
ctx.strokeStyle = c;
ctx.lineWidth = 5;
ctx.beginPath();
ctx.arc(st.x, st.y, r, i * step, (i + 1) * step);
ctx.stroke();
});
}
}
if (!timelapse.active && ((tool === 'transfer' && activeSt && activeSt.id === st.id) || (tool === 'route' && routeStartId === st.id))) {
ctx.globalAlpha = 1;
ctx.strokeStyle = '#3b82f6';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.arc(st.x, st.y, r + 7, 0, Math.PI * 2);
ctx.stroke();
}
ctx.restore();
});
visibleStations.forEach(st => {
const lbl = labelLayouts.get(st.id);
if (!lbl) return;
const isDimmed = hasRoute && !activeRoute.stationIds.has(st.id);
ctx.save();
if (isDimmed) ctx.globalAlpha = 0.35;
ctx.translate(lbl.x, lbl.y);
if (lbl.angle !== 0) ctx.rotate(lbl.angle);
ctx.font = '600 13px system-ui, sans-serif';
ctx.textAlign = lbl.align;
ctx.textBaseline = lbl.baseline;
ctx.lineWidth = 3.5;
ctx.strokeStyle = dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(244, 246, 248, 0.9)';
ctx.strokeText(st.name, 0, 0);
ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
ctx.fillText(st.name, 0, 0);
ctx.restore();
});
if (!timelapse.active && tool === 'ruler') drawRulerOverlay(dark);
ctx.restore();
drawScaleBar(dark);
drawTimelapseHUD(dark);
}
// ==========================================
// УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ, ПРЕСЕТАМИ И СОБЫТИЯМИ
// ==========================================
const mainMenu = document.getElementById('mainMenu');
const settingsModal = document.getElementById('settingsModal');
const savesModal = document.getElementById('savesModal') || document.getElementById('presetsModal');
function openSavesWindow() {
renderSavesList();
if (savesModal) savesModal.classList.remove('hidden');
}
function closeSavesWindow() {
if (savesModal) savesModal.classList.add('hidden');
}
Array.of('openSavesBtn', 'inGameSavesBtn', 'savesBtn', 'presetsBtn', 'openPresetsBtn').forEach(btnId => {
const el = document.getElementById(btnId);
if (el) el.addEventListener('click', openSavesWindow);
});
Array.of('closeSavesBtn', 'closePresetsBtn').forEach(btnId => {
const el = document.getElementById(btnId);
if (el) el.addEventListener('click', closeSavesWindow);
});
Array.of('savePresetBtn', 'saveCurrentPresetBtn', 'addSaveBtn').forEach(btnId => {
const el = document.getElementById(btnId);
if (el) el.addEventListener('click', () => window.saveCurrentAsPreset());
});
const playBtn = document.getElementById('playBtn');
if (playBtn) playBtn.addEventListener('click', () => {
if (mainMenu) mainMenu.classList.add('hidden');
});
const backToMenuBtn = document.getElementById('backToMenuBtn');
if (backToMenuBtn) backToMenuBtn.addEventListener('click', () => {
if (timelapse.active) stopTimelapse();
activeSt = null;
if (mainMenu) mainMenu.classList.remove('hidden');
});
const openSettingsBtn = document.getElementById('openSettingsBtn');
if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => {
if (settingsModal) settingsModal.classList.remove('hidden');
});
const inGameSettingsBtn = document.getElementById('inGameSettingsBtn');
if (inGameSettingsBtn) inGameSettingsBtn.addEventListener('click', () => {
if (settingsModal) settingsModal.classList.remove('hidden');
});
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => {
if (settingsModal) settingsModal.classList.add('hidden');
});
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', () => {
if (confirm('Сбросить все настройки холста до заводских значений?')) {
settings = Object.assign({}, DEFAULT_SETTINGS);
applySettingsToUI();
saveSettings();
draw();
}
});
const closeRouteBtn = document.getElementById('closeRouteBtn');
if (closeRouteBtn) closeRouteBtn.addEventListener('click', () => {
clearRoute();
draw();
});
const timelapseBtn = document.getElementById('timelapseBtn');
if (timelapseBtn) timelapseBtn.addEventListener('click', () => startTimelapse(false));
const recordVideoBtn = document.getElementById('recordVideoBtn');
if (recordVideoBtn) recordVideoBtn.addEventListener('click', () => startTimelapse(true));
document.getElementById('gridSizeInput').addEventListener('input', e => {
settings.gridSize = Number(e.target.value);
document.getElementById('gridSizeVal').textContent = settings.gridSize + ' px';
saveSettings();
draw();
});
document.getElementById('lineWidthInput').addEventListener('input', e => {
settings.lineWidth = Number(e.target.value);
document.getElementById('lineWidthVal').textContent = settings.lineWidth + ' px';
saveSettings();
draw();
});
document.getElementById('showGridInput').addEventListener('change', e => {
settings.showGrid = e.target.checked;
saveSettings();
draw();
});
document.getElementById('snapGridInput').addEventListener('change', e => {
settings.snapToGrid = e.target.checked;
applySettingsToUI();
saveSettings();
draw();
});
document.getElementById('animationsInput').addEventListener('change', e => {
settings.animations = e.target.checked;
saveSettings();
draw();
});
document.getElementById('stubStationsInput').addEventListener('change', e => {
settings.stubStations = e.target.checked;
saveSettings();
draw();
});
document.getElementById('lineBadgesInput').addEventListener('change', e => {
settings.lineBadges = e.target.checked;
saveSettings();
draw();
});
document.getElementById('riverBridgesInput').addEventListener('change', e => {
settings.riverBridges = e.target.checked;
saveSettings();
draw();
});
document.getElementById('snapToggleBtn').addEventListener('click', toggleSnap);
document.getElementById('smartLabelsInput').addEventListener('change', e => {
settings.smartLabels = e.target.checked;
saveSettings();
draw();
});
document.getElementById('darkThemeInput').addEventListener('change', e => {
settings.darkTheme = e.target.checked;
document.body.classList.toggle('dark', settings.darkTheme);
saveSettings();
draw();
});
document.getElementById('bgOpacityInput').addEventListener('input', e => {
settings.bgOpacity = Number(e.target.value);
document.getElementById('bgOpacityVal').textContent = Math.round(settings.bgOpacity * 100) + '%';
saveSettings();
draw();
});
document.getElementById('bgScaleInput').addEventListener('input', e => {
settings.bgScale = Number(e.target.value);
document.getElementById('bgScaleVal').textContent = Math.round(settings.bgScale * 100) + '%';
saveSettings();
draw();
});
document.getElementById('removeBgBtn').addEventListener('click', () => {
saveSnapshot();
state.bgImage = null;
syncBgImageObject(null);
persistState();
});
const uploadBgInput = document.getElementById('uploadBgInput');
document.getElementById('uploadBgBtn').addEventListener('click', () => {
uploadBgInput.value = '';
uploadBgInput.click();
});
uploadBgInput.addEventListener('change', e => {
const file = e.target.files.item(0);
if (!file) return;
const reader = new FileReader();
reader.onload = ev => {
saveSnapshot();
state.bgImage = ev.target.result;
syncBgImageObject(state.bgImage);
persistState();
};
reader.readAsDataURL(file);
});
canvas.addEventListener('mousedown', e => {
const w = toWorld(e.clientX, e.clientY);
if (e.button === 1 || space) {
panning = true;
panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y };
return;
}
if (timelapse.active) return;
if (e.button === 2) {
activeSt = null;
clearRoute();
clearRuler();
draw();
return;
}
if (tool !== 'erase') {
const hitBadge = renderedBadges.find(b => Math.hypot(b.x - w.x, b.y - w.y) <= b.r + 4);
if (hitBadge) {
promptRenameLineCode(hitBadge.color, hitBadge.code);
return;
}
}
if (tool === 'move') {
const h = hitSt(w);
if (h) {
saveSnapshot();
dragSt = h;
return;
}
const hitSeg = state.segments.find(seg => distToSegmentObj(w, seg) <= Math.max(settings.lineWidth + 4, 14));
if (hitSeg) {
saveSnapshot();
dragSeg = hitSeg;
if (!dragSeg.cp) {
dragSeg.cp = { x: w.x, y: w.y };
}
draw();
return;
}
panning = true;
panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y };
} else if (tool === 'line') {
clearRoute();
saveSnapshot();
let h = hitSt(w);
if (!h) {
const sn = activeSt ? snapAngle(activeSt, w) : snapGrid(w);
h = { id: Date.now() + Math.random(), x: sn.x, y: sn.y, name: 'Станция ' + (state.stations.length + 1) };
state.stations.push(h);
}
if (activeSt && activeSt.id !== h.id) {
state.segments.push({ id: Date.now() + Math.random(), from: activeSt.id, to: h.id, color, cp: null });
}
activeSt = h;
persistState();
updateLegendUI();
draw();
} else if (tool === 'transfer') {
clearRoute();
const h = hitSt(w);
if (!h) {
activeSt = null;
draw();
return;
}
if (!activeSt) {
activeSt = h;
draw();
} else if (activeSt.id !== h.id) {
const exists = state.transfers.some(
tr => (tr.from === activeSt.id && tr.to === h.id) || (tr.from === h.id && tr.to === activeSt.id)
);
if (!exists) {
saveSnapshot();
state.transfers.push({ id: Date.now() + Math.random(), from: activeSt.id, to: h.id });
persistState();
}
activeSt = null;
draw();
}
} else if (tool === 'route') {
const h = hitSt(w);
if (!h) {
clearRoute();
draw();
return;
}
if (!routeStartId || activeRoute) {
clearRoute();
routeStartId = h.id;
const panel = document.getElementById('routePanel');
if (panel) panel.classList.remove('hidden');
document.getElementById('routeTitle').textContent = '🧭 Старт: ' + h.name;
document.getElementById('routeDetails').textContent = 'Нажмите на конечную станцию для построения маршрута...';
draw();
} else if (routeStartId !== h.id) {
const startSt = state.stations.find(s => s.id === routeStartId);
const found = findShortestRoute(routeStartId, h.id);
activeRoute = found;
if (startSt) showRouteSummary(startSt, h, found);
routeStartId = null;
startRouteAnimation();
}
} else if (tool === 'ruler') {
const pt = hitSt(w) || w;
if (!rulerStart || rulerLocked) {
rulerStart = { x: pt.x, y: pt.y };
rulerEnd = null;
rulerLocked = false;
} else {
rulerEnd = { x: pt.x, y: pt.y };
rulerLocked = true;
}
draw();
} else if (tool === 'river') {
saveSnapshot();
curRiver = Array.of(w);
} else if (tool === 'erase') {
clearRoute();
const h = hitSt(w);
if (h) {
saveSnapshot();
state.stations = state.stations.filter(s => s.id !== h.id);
state.segments = state.segments.filter(g => g.from !== h.id && g.to !== h.id);
state.transfers = state.transfers.filter(tr => tr.from !== h.id && tr.to !== h.id);
if (activeSt && activeSt.id === h.id) activeSt = null;
persistState();
updateLegendUI();
draw();
return;
}
const hitSeg = state.segments.find(seg => distToSegmentObj(w, seg) <= Math.max(settings.lineWidth, 10));
if (hitSeg) {
saveSnapshot();
state.segments = state.segments.filter(seg => seg.id !== hitSeg.id);
persistState();
updateLegendUI();
draw();
return;
}
const hitTr = state.transfers.find(tr => {
const s1 = state.stations.find(s => s.id === tr.from);
const s2 = state.stations.find(s => s.id === tr.to);
return s1 && s2 && distToSegment(w, s1, s2) <= 14;
});
if (hitTr) {
saveSnapshot();
state.transfers = state.transfers.filter(tr => tr.id !== hitTr.id);
persistState();
draw();
return;
}
const hitRiver = state.rivers.some(rv => rv.some(p => Math.hypot(p.x - w.x, p.y - w.y) < 25));
if (hitRiver) {
saveSnapshot();
state.rivers = state.rivers.filter(rv => rv.some(p => Math.hypot(p.x - w.x, p.y - w.y) < 25) === false);
persistState();
draw();
}
}
});
canvas.addEventListener('mousemove', e => {
mouseW = toWorld(e.clientX, e.clientY);
if (panning) { cam.x = e.clientX - panStart.x; cam.y = e.clientY - panStart.y; draw(); return; }
if (timelapse.active) return;
if (dragSt) {
const sn = snapGrid(mouseW);
dragSt.x = sn.x;
dragSt.y = sn.y;
draw();
return;
}
if (dragSeg) {
const s1 = state.stations.find(s => s.id === dragSeg.from);
const s2 = state.stations.find(s => s.id === dragSeg.to);
if (s1 && s2) {
const sn = snapGrid(mouseW);
dragSeg.cp = {
x: 2 * sn.x - 0.5 * (s1.x + s2.x),
y: 2 * sn.y - 0.5 * (s1.y + s2.y)
};
draw();
}
return;
}
if (curRiver) {
const last = curRiver.at(-1);
if (last && Math.hypot(mouseW.x - last.x, mouseW.y - last.y) > 15) { curRiver.push(mouseW); draw(); }
return;
}
if ((tool === 'line' || tool === 'transfer') && activeSt) draw();
if (tool === 'ruler' && rulerStart && !rulerLocked) draw();
});
addEventListener('mouseup', () => {
panning = false;
if (dragSt || dragSeg) {
dragSt = null;
dragSeg = null;
persistState();
draw();
}
if (curRiver) {
if (curRiver.length > 1) state.rivers.push(curRiver);
curRiver = null;
persistState();
draw();
}
});
canvas.addEventListener('dblclick', e => {
if (timelapse.active) return;
const w = toWorld(e.clientX, e.clientY);
const h = hitSt(w);
if (h) {
const n = prompt('Название станции:', h.name);
if (n !== null) {
saveSnapshot();
h.name = n.trim();
persistState();
draw();
}
return;
}
const hitSeg = state.segments.find(seg => seg.cp && distToSegmentObj(w, seg) <= Math.max(settings.lineWidth + 4, 14));
if (hitSeg) {
saveSnapshot();
hitSeg.cp = null;
persistState();
draw();
}
});
canvas.addEventListener('wheel', e => {
e.preventDefault();
const nz = Math.min(Math.max(cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.2), 4);
cam.x = e.clientX - (e.clientX - cam.x) * (nz / cam.zoom);
cam.y = e.clientY - (e.clientY - cam.y) * (nz / cam.zoom);
cam.zoom = nz;
draw();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
if (e.code === 'Space') space = true;
if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) {
e.preventDefault();
toggleSnap();
}
if (e.code === 'Escape') {
if (timelapse.active) stopTimelapse();
else if (savesModal && !savesModal.classList.contains('hidden')) closeSavesWindow();
else if (settingsModal && !settingsModal.classList.contains('hidden')) settingsModal.classList.add('hidden');
else { activeSt = null; clearRoute(); clearRuler(); draw(); }
}
if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
document.querySelectorAll('.tool-btn').forEach(b => {
if (!b.dataset.tool) return;
b.addEventListener('click', () => {
if (timelapse.active) stopTimelapse();
document.querySelectorAll('.tool-btn').forEach(x => {
if (x.dataset.tool) x.classList.remove('active');
});
b.classList.add('active');
tool = b.dataset.tool;
activeSt = null;
if (tool !== 'route') clearRoute();
if (tool !== 'ruler') clearRuler();
draw();
});
});
document.querySelectorAll('.color-dot').forEach(d => d.addEventListener('click', () => {
document.querySelectorAll('.color-dot').forEach(x => x.classList.remove('active'));
d.classList.add('active');
color = d.dataset.color;
draw();
}));
document.getElementById('customColor').addEventListener('input', e => {
document.querySelectorAll('.color-dot').forEach(x => x.classList.remove('active'));
color = e.target.value;
draw();
});
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('clearBtn').addEventListener('click', () => {
if (confirm('Очистить схему?')) {
if (timelapse.active) stopTimelapse();
saveSnapshot();
state = { stations: Array.of(), segments: Array.of(), transfers: Array.of(), rivers: Array.of(), lineNames: {}, lineCodes: {}, bgImage: null };
syncBgImageObject(null);
activeSt = null;
clearRoute();
clearRuler();
persistState();
updateLegendUI();
draw();
}
});
document.getElementById('exportPngBtn').addEventListener('click', () => {
if (timelapse.active) stopTimelapse();
const prevRoute = activeRoute;
const prevRulerStart = rulerStart;
activeRoute = null;
rulerStart = null;
draw();
const lines = getActiveLines();
if (lines.length) {
const dark = document.body.classList.contains('dark');
const pad = 16;
const rowH = 24;
const boxW = 240;
const boxH = 38 + lines.length * rowH;
ctx.save();
ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)';
ctx.strokeStyle = dark ? '#334155' : '#cbd5e1';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(pad, pad, boxW, boxH, 12);
ctx.fill();
ctx.stroke();
ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
ctx.font = '700 11px system-ui, sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.fillText('ЛЕГЕНДА ЛИНИЙ', pad + 14, pad + 12);
lines.forEach((line, idx) => {
const y = pad + 34 + idx * rowH;
ctx.fillStyle = line.color;
ctx.beginPath();
ctx.roundRect(pad + 14, y + 4, 20, 6, 3);
ctx.fill();
ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
ctx.font = '500 13px system-ui, sans-serif';
ctx.fillText(line.code + '. ' + line.name, pad + 42, y);
});
ctx.restore();
}
const a = document.createElement('a');
a.download = 'metro-map.png';
a.href = canvas.toDataURL('image/png');
a.click();
activeRoute = prevRoute;
rulerStart = prevRulerStart;
draw();
});
document.getElementById('exportJsonBtn').addEventListener('click', () => {
const payload = {
project: 'Metro Project',
version: '1.1-beta-demo',
exportedAt: new Date().toISOString(),
settings,
state
};
const blob = new Blob(Array.of(JSON.stringify(payload, null, 2)), { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.download = 'metro-map.json';
a.href = url;
a.click();
URL.revokeObjectURL(url);
});
const importJsonInput = document.getElementById('importJsonInput');
document.getElementById('importJsonBtn').addEventListener('click', () => {
importJsonInput.value = '';
importJsonInput.click();
});
importJsonInput.addEventListener('change', e => {
const file = e.target.files.item(0);
if (!file) return;
const reader = new FileReader();
reader.onload = ev => {
try {
const parsed = JSON.parse(ev.target.result);
const nextState = parsed.state ? parsed.state : parsed;
if (!Array.isArray(nextState.stations) || !Array.isArray(nextState.segments)) {
alert('Некорректный формат файла схемы.');
return;
}
if (timelapse.active) stopTimelapse();
saveSnapshot();
state = normalizeState(nextState);
syncBgImageObject(state.bgImage);
const importedSettings = parsed.settings ? Object.assign({}, DEFAULT_SETTINGS, parsed.settings) : null;
if (importedSettings) {
settings = importedSettings;
saveSettings();
applySettingsToUI();
}
// Автоматически кидаем загруженный пресет во вкладку сохранений (после встроенного Демо)
const presetTitle = parsed.name || file.name.replace(/.json$/i, '');
registerPresetInSaves(presetTitle, state, importedSettings);
activeSt = null;
clearRoute();
clearRuler();
persistState();
updateLegendUI();
draw();
} catch (err) {
alert('Ошибка при чтении JSON-файла.');
}
};
reader.readAsText(file);
});
applySettingsToUI();
renderSavesList();
updateLegendUI();
resize();
document.addEventListener('click', function(ev) {
const btn = ev.target.closest('button');
if (!btn) return;
const label = (btn.textContent || '').toLowerCase();
const isSavesTrigger =
btn.id === 'openSavesBtn' ||
btn.id === 'inGameSavesBtn' ||
btn.id === 'savesBtn' ||
btn.id === 'presetsBtn' ||
btn.id === 'openPresetsBtn' ||
(label.includes('сохранен') && label.includes('пресет'));
if (!isSavesTrigger) return;
ev.preventDefault();
ev.stopPropagation();
let modal = document.getElementById('savesModal') || document.getElementById('presetsModal');
if (!modal) {
modal = document.createElement('div');
modal.id = 'savesModal';
modal.className = 'glass-overlay hidden';
modal.style.zIndex = '9999';
modal.innerHTML =
'' +
'💾 Сохранения и пресеты' +
'' +
'' +
'➕ Сохранить текущую схему' +
'Закрыть' +
'';
document.body.appendChild(modal);
document.getElementById('closeSavesBtn').addEventListener('click', function() {
modal.classList.add('hidden');
});
document.getElementById('saveCurrentPresetBtn').addEventListener('click', function() {
if (typeof window.saveCurrentAsPreset === 'function') {
window.saveCurrentAsPreset();
}
});
}
modal.style.zIndex = '9999';
modal.style.opacity = '1';
modal.style.pointerEvents = 'auto';
modal.classList.remove('hidden');
if (typeof renderSavesList === 'function') {
renderSavesList();
}
}, true);
(function bindSavesModalCleanly() {
const modal = document.getElementById('savesModal') || document.getElementById('presetsModal');
if (!modal) return;
function openModal() {
modal.style.zIndex = '9999';
modal.style.opacity = '';
modal.style.pointerEvents = '';
modal.classList.remove('hidden');
if (typeof renderSavesList === 'function') renderSavesList();
}
function closeModal() {
modal.style.opacity = '';
modal.style.pointerEvents = '';
modal.classList.add('hidden');
}
document.querySelectorAll('button').forEach(btn => {
const txt = (btn.textContent || '').trim().toLowerCase();
if (modal.contains(btn)) {
if (txt === 'закрыть' || btn.id === 'closeSavesBtn' || btn.id === 'closePresetsBtn') {
btn.onclick = e => { e.preventDefault(); closeModal(); };
} else if (txt.includes('сохранить текущую') || btn.id === 'saveCurrentPresetBtn' || btn.id === 'savePresetBtn') {
btn.onclick = e => {
e.preventDefault();
if (typeof window.saveCurrentAsPreset === 'function') window.saveCurrentAsPreset();
};
}
} else if (
btn.id === 'openSavesBtn' ||
btn.id === 'inGameSavesBtn' ||
btn.id === 'savesBtn' ||
btn.id === 'presetsBtn' ||
(txt.includes('сохранен') && txt.includes('пресет'))
) {
btn.onclick = e => { e.preventDefault(); openModal(); };
}
});
modal.addEventListener('click', e => {
if (e.target === modal) closeModal();
});
})();
(function attachLineBadgesPatch() {
if (typeof settings.lineBadges !== 'boolean') {
settings.lineBadges = true;
}
// 1. Находим или создаём тумблер в окне настроек
let checkbox = document.getElementById('lineBadgesInput');
if (!checkbox) {
const settingsCard = document.querySelector('#settingsModal .settings-card');
const footer = settingsCard ? settingsCard.querySelector('.settings-footer') : null;
if (settingsCard) {
const row = document.createElement('div');
row.className = 'setting-item row';
row.innerHTML = 'Кружки-маркеры на концах линий';
if (footer) settingsCard.insertBefore(row, footer);
else settingsCard.appendChild(row);
checkbox = document.getElementById('lineBadgesInput');
}
}
if (checkbox) {
checkbox.checked = Boolean(settings.lineBadges);
checkbox.onchange = function(e) {
settings.lineBadges = Boolean(e.target.checked);
if (typeof saveSettings === 'function') saveSettings();
if (typeof draw === 'function') draw();
};
}
// 2. Если тумблер выключен — не рисуем кружки и очищаем хитбоксы
const origDrawBadges = window.drawLineEndpointBadges || (typeof drawLineEndpointBadges === 'function' ? drawLineEndpointBadges : null);
if (origDrawBadges) {
const patchedDrawBadges = function(lWidth, dark, hasRoute, segsList) {
if (!settings.lineBadges) {
if (typeof renderedBadges !== 'undefined') renderedBadges = Array.of();
return;
}
return origDrawBadges.apply(this, arguments);
};
window.drawLineEndpointBadges = patchedDrawBadges;
try { drawLineEndpointBadges = patchedDrawBadges; } catch (e) {}
}
// 3. Разводим подписи конечных станций с кружками-маркерами, чтобы текст не налезал
const origComputeLabel = window.computeSmartLabel || (typeof computeSmartLabel === 'function' ? computeSmartLabel : null);
if (origComputeLabel) {
const patchedComputeLabel = function(st, r, placedBoxes, segsList, trsList) {
const res = origComputeLabel.apply(this, arguments);
if (!settings.lineBadges || !res || !Array.isArray(segsList)) return res;
const incident = segsList.filter(s => s.from === st.id || s.to === st.id);
if (incident.length !== 1) return res;
const seg = incident.at(0);
const otherId = seg.from === st.id ? seg.to : seg.from;
const otherSt = state.stations.find(s => s.id === otherId);
if (!otherSt) return res;
const refPt = seg.cp || otherSt;
const badgeAngle = Math.atan2(st.y - refPt.y, st.x - refPt.x);
const badgeDist = (settings.lineWidth || 8) + Math.max((settings.lineWidth || 8) + 6, 13) + 12;
const bx = st.x + Math.cos(badgeAngle) * badgeDist;
const by = st.y + Math.sin(badgeAngle) * badgeDist;
const badgeR = Math.max((settings.lineWidth || 8) + 6, 13) + 6;
// Проверяем, не попадает ли бокс подписи на кружок-маркер
const b = res.box;
if (b && bx + badgeR > b.x1 && bx - badgeR < b.x2 && by + badgeR > b.y1 && by - badgeR < b.y2) {
// Сдвигаем подпись перпендикулярно линии в свободную сторону от кружка
const perp = badgeAngle - Math.PI / 2;
const shift = r + 14;
res.x = st.x + Math.cos(perp) * shift;
res.y = st.y + Math.sin(perp) * shift;
res.align = Math.cos(perp) > 0.25 ? 'left' : (Math.cos(perp) < -0.25 ? 'right' : 'center');
res.baseline = Math.sin(perp) > 0.25 ? 'top' : (Math.sin(perp) < -0.25 ? 'bottom' : 'middle');
res.angle = 0;
}
return res;
};
window.computeSmartLabel = patchedComputeLabel;
try { computeSmartLabel = patchedComputeLabel; } catch (e) {}
}
// Также подхватываем клик по кнопке сброса настроек, чтобы тумблер синхронизировался
const resetBtn = document.getElementById('resetSettingsBtn');
if (resetBtn) {
resetBtn.addEventListener('click', function() {
setTimeout(function() {
if (checkbox) checkbox.checked = Boolean(settings.lineBadges);
}, 20);
});
}
if (typeof draw === 'function') draw();
})();