const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let state = { stations: [], segments: [], transfers: [], rivers: [], lineNames: {} };
let history = [];

// Настройки холста
let settings = {
  gridSize: 40,
  lineWidth: 8,
  showGrid: true,
  snapToGrid: true,
  smartLabels: true,
  darkTheme: false
};

let cam = { x: innerWidth / 2, y: innerHeight / 2, zoom: 1 };
let tool = 'line';
let color = '#ef4444';
let panning = false;
let panStart = { x: 0, y: 0 };
let space = false;
let activeSt = null;
let dragSt = null;
let curRiver = null;
let mouseW = { x: 0, y: 0 };

// Состояние маршрутизатора
let routeStartId = null;
let activeRoute = null;

function normalizeState(raw) {
  return {
    stations: Array.isArray(raw.stations) ? raw.stations : [],
    segments: Array.isArray(raw.segments) ? raw.segments : [],
    transfers: Array.isArray(raw.transfers) ? raw.transfers : [],
    rivers: Array.isArray(raw.rivers) ? raw.rivers : [],
    lineNames: raw.lineNames && typeof raw.lineNames === 'object' ? raw.lineNames : {}
  };
}

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  draw();
}
addEventListener('resize', resize);

function save() {
  history.push(JSON.stringify(state));
  if (history.length > 40) history.shift();
  try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
}

function saveSettings() {
  try { localStorage.setItem('metro_settings_v1', JSON.stringify(settings)); } catch (e) {}
}

try {
  const saved = localStorage.getItem('metro_v1');
  if (saved) state = normalizeState(JSON.parse(saved));
  const savedSet = localStorage.getItem('metro_settings_v1');
  if (savedSet) settings = Object.assign(settings, JSON.parse(savedSet));
} catch (e) {}

function applySettingsToUI() {
  document.getElementById('gridSizeInput').value = settings.gridSize;
  document.getElementById('gridSizeVal').textContent = settings.gridSize + ' px';
  document.getElementById('lineWidthInput').value = settings.lineWidth;
  document.getElementById('lineWidthVal').textContent = settings.lineWidth + ' px';
  document.getElementById('showGridInput').checked = settings.showGrid;
  document.getElementById('snapGridInput').checked = settings.snapToGrid;
  document.getElementById('smartLabelsInput').checked = settings.smartLabels;
  document.getElementById('darkThemeInput').checked = settings.darkTheme;
  document.getElementById('snapToggleBtn').classList.toggle('active', settings.snapToGrid);
  document.body.classList.toggle('dark', settings.darkTheme);
}

function toggleSnap() {
  settings.snapToGrid = !settings.snapToGrid;
  applySettingsToUI();
  saveSettings();
  draw();
}

function clearRoute() {
  routeStartId = null;
  activeRoute = null;
  document.getElementById('routePanel').classList.add('hidden');
}

function undo() {
  if (!history.length) return;
  state = normalizeState(JSON.parse(history.pop()));
  activeSt = null;
  clearRoute();
  try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
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

const hitSt = (p, r = 22) => state.stations.find(s => Math.hypot(s.x - p.x, s.y - p.y) <= r);
const stColors = id => Array.from(new Set(state.segments.filter(g => g.from === id || g.to === id).map(g => g.color)));

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ==========================================
// ЛЕГЕНДА ЛИНИЙ
// ==========================================
const DEFAULT_COLOR_NAMES = new Map([
  ['#ef4444', 'Красная линия'],
  ['#3b82f6', 'Синяя линия'],
  ['#22c55e', 'Зелёная линия'],
  ['#eab308', 'Жёлтая линия'],
  ['#a855f7', 'Фиолетовая линия'],
  ['#ec4899', 'Розовая линия']
]);

function getActiveLines() {
  const uniqueColors = Array.from(new Set(state.segments.map(s => s.color)));
  return uniqueColors.map((col, idx) => {
    const customName = Object.prototype.hasOwnProperty.call(state.lineNames, col) ? state.lineNames[col] : '';
    const fallback = DEFAULT_COLOR_NAMES.get(col.toLowerCase()) || ('Линия ' + (idx + 1));
    return {
      index: idx + 1,
      color: col,
      name: customName || fallback
    };
  });
}

function updateLegendUI() {
  const panel = document.getElementById('legendPanel');
  const list = document.getElementById('legendList');
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
    label.textContent = line.index + '. ' + line.name;

    item.appendChild(swatch);
    item.appendChild(label);

    item.addEventListener('click', () => {
      const next = prompt('Название линии метро:', line.name);
      if (next !== null) {
        save();
        const trimmed = next.trim();
        if (trimmed) {
          state.lineNames = Object.assign({}, state.lineNames, { [line.color]: trimmed });
        } else {
          const copy = Object.assign({}, state.lineNames);
          delete copy[line.color];
          state.lineNames = copy;
        }
        try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
        updateLegendUI();
      }
    });

    list.appendChild(item);
  });
}

// ==========================================
// МАРШРУТИЗАТОР (АЛГОРИТМ ОПРОСА ВО ВСЕ СТОРОНЫ / BFS)
// ==========================================
function buildAdjacencyGraph() {
  const adj = new Map();
  state.stations.forEach(st => adj.set(st.id, []));

  state.segments.forEach(seg => {
    if (!adj.has(seg.from) || !adj.has(seg.to)) return;
    adj.get(seg.from).push({ to: seg.to, type: 'segment', color: seg.color });
    adj.get(seg.to).push({ to: seg.from, type: 'segment', color: seg.color });
  });

  state.transfers.forEach(tr => {
    if (!adj.has(tr.from) || !adj.has(tr.to)) return;
    adj.get(tr.from).push({ to: tr.to, type: 'transfer', color: null });
    adj.get(tr.to).push({ to: tr.from, type: 'transfer', color: null });
  });

  return adj;
}

function findShortestRoute(startId, endId) {
  if (startId === endId) return null;
  const adj = buildAdjacencyGraph();
  const queue = [startId];
  const visited = new Set([startId]);
  const parent = new Map();

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === endId) break;

    const neighbors = adj.get(curr) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        parent.set(edge.to, { prevId: curr, edge });
        queue.push(edge.to);
      }
    }
  }

  if (!visited.has(endId)) return null;

  const edges = [];
  const stationIds = new Set([startId, endId]);
  let curr = endId;

  while (curr !== startId) {
    const step = parent.get(curr);
    edges.unshift({ from: step.prevId, to: curr, type: step.edge.type, color: step.edge.color });
    stationIds.add(step.prevId);
    curr = step.prevId;
  }

  return { stationIds, edges };
}

function showRouteSummary(startSt, endSt, route) {
  const panel = document.getElementById('routePanel');
  const title = document.getElementById('routeTitle');
  const details = document.getElementById('routeDetails');

  panel.classList.remove('hidden');

  if (!route) {
    title.textContent = '🧭 ' + startSt.name + ' → ' + endSt.name;
    details.textContent = 'Путь не найден: станции не связаны ветками или переходами.';
    return;
  }

  let stops = 0;
  let transfersCount = 0;
  const transferNotes = [];
  let prevColor = null;

  route.edges.forEach(edge => {
    const fromSt = state.stations.find(s => s.id === edge.from);
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

  title.textContent = '🧭 ' + startSt.name + ' → ' + endSt.name;
  const extra = transferNotes.length ? ' (' + transferNotes.join(', ') + ')' : ' (без пересадок)';
  details.textContent = 'Перегонов: ' + stops + ' • Пересадок: ' + transfersCount + extra;
}

// ==========================================
// УМНЫЕ ПОДПИСИ СТАНЦИЙ
// ==========================================
function boxesOverlap(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function getIncidentAngles(st) {
  const angles = [];
  state.segments.forEach(seg => {
const otherId = seg.from === st.id ? seg.to : (seg.to === st.id ? seg.from : null);
if (!otherId) return;
const other = state.stations.find(s => s.id === otherId);
if (other) angles.push(Math.atan2(other.y - st.y, other.x - st.x));
});
state.transfers.forEach(tr => {
const otherId = tr.from === st.id ? tr.to : (tr.to === st.id ? tr.from : null);
if (!otherId) return;
const other = state.stations.find(s => s.id === otherId);
if (other) angles.push(Math.atan2(other.y - st.y, other.x - st.x));
});
return angles;
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
function computeSmartLabel(st, r, placedBoxes) {
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
box: { x1: st.x - textW / 2, y1: st.y - pad - textH, x2: st.x + textW / 2, y2: st.y - pad }
};
}
const incidentAngles = getIncidentAngles(st);
const candidates = [
{ dx: 0, dy: -pad, align: 'center', baseline: 'bottom', angle: 0, dir: -Math.PI / 2, prio: 0 },
{ dx: 0, dy: pad, align: 'center', baseline: 'top', angle: 0, dir: Math.PI / 2, prio: 1 },
{ dx: pad, dy: 0, align: 'left', baseline: 'middle', angle: 0, dir: 0, prio: 2 },
{ dx: -pad, dy: 0, align: 'right', baseline: 'middle', angle: 0, dir: Math.PI, prio: 3 },
{ dx: pad * 0.8, dy: -pad * 0.8, align: 'left', baseline: 'bottom', angle: -Math.PI / 4, dir: -Math.PI / 4, prio: 4 },
{ dx: pad * 0.8, dy: pad * 0.8, align: 'left', baseline: 'top', angle: 0, dir: Math.PI / 4, prio: 5 },
{ dx: -pad * 0.8, dy: -pad * 0.8, align: 'right', baseline: 'bottom', angle: 0, dir: -3 * Math.PI / 4, prio: 6 },
{ dx: -pad * 0.8, dy: pad * 0.8, align: 'right', baseline: 'top', angle: -Math.PI / 4, dir: 3 * Math.PI / 4, prio: 7 }
];
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
best = { x: lx, y: ly, align: c.align, baseline: c.baseline, angle: c.angle, box };
}
});
return best;
}
// ==========================================
// ОТРИСОВКА ХОЛСТА
// ==========================================
function drawTransferBridge(s1, s2, lWidth, dark, isPreview = false) {
ctx.save();
if (isPreview) ctx.globalAlpha = 0.6;
ctx.lineCap = 'round';
ctx.strokeStyle = dark ? '#94a3b8' : '#334155';
ctx.lineWidth = lWidth + 6;
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(s2.x, s2.y);
ctx.stroke();
ctx.strokeStyle = dark ? '#0f172a' : '#ffffff';
ctx.lineWidth = Math.max(lWidth - 2, 4);
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(s2.x, s2.y);
ctx.stroke();
ctx.restore();
}
function draw() {
const dark = document.body.classList.contains('dark');
const gSize = settings.gridSize;
const lWidth = settings.lineWidth;
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.save();
ctx.translate(cam.x, cam.y);
ctx.scale(cam.zoom, cam.zoom);
if (settings.showGrid) {
const sx = Math.floor((-cam.x / cam.zoom) / gSize) * gSize - gSize;
const ex = sx + canvas.width / cam.zoom + gSize * 2;
const sy = Math.floor((-cam.y / cam.zoom) / gSize) * gSize - gSize;
const ey = sy + canvas.height / cam.zoom + gSize * 2;
ctx.strokeStyle = dark ? '#1e293b' : '#e2e8f0';
ctx.lineWidth = 1 / cam.zoom;
ctx.beginPath();
for (let x = sx; x < ex; x += gSize) { ctx.moveTo(x, sy); ctx.lineTo(x, ey); }
for (let y = sy; y < ey; y += gSize) { ctx.moveTo(sx, y); ctx.lineTo(ex, y); }
ctx.stroke();
}
// 1. Слой рек
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
const riversList = curRiver ? state.rivers.concat([curRiver]) : state.rivers;
riversList.forEach(rv => {
if (!rv || rv.length < 2) return;
ctx.strokeStyle = dark ? '#0284c7' : '#bae6fd';
ctx.lineWidth = 36;
ctx.beginPath();
rv.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
ctx.stroke();
});
// 2. Слой пешеходных переходов
state.transfers.forEach(tr => {
const s1 = state.stations.find(s => s.id === tr.from);
const s2 = state.stations.find(s => s.id === tr.to);
if (!s1 || !s2) return;
drawTransferBridge(s1, s2, lWidth, dark, false);
});
if (tool === 'transfer' && activeSt) {
const target = hitSt(mouseW) || mouseW;
drawTransferBridge(activeSt, target, lWidth, dark, true);
}
// 3. Слой веток метро
const hasRoute = Boolean(activeRoute && activeRoute.edges.length > 0);
const pairs = new Map();
state.segments.forEach(g => {
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
ctx.lineTo(s2.x + ox, s2.y + oy);
ctx.stroke();
ctx.restore();
});
// 3.5 Подсветка найденного маршрута поверх линий
if (hasRoute) {
activeRoute.edges.forEach(edge => {
const s1 = state.stations.find(s => s.id === edge.from);
const s2 = state.stations.find(s => s.id === edge.to);
if (!s1 || !s2) return;
ctx.save();
ctx.lineCap = 'round';
ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(37, 99, 235, 0.3)';
ctx.lineWidth = lWidth + 10;
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(s2.x, s2.y);
ctx.stroke();
ctx.strokeStyle = edge.color || (dark ? '#f8fafc' : '#2563eb');
ctx.lineWidth = lWidth + 2;
ctx.beginPath();
ctx.moveTo(s1.x, s1.y);
ctx.lineTo(s2.x, s2.y);
ctx.stroke();
ctx.restore();
});
}
if (tool === 'line' && activeSt) {
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
// 4. Круги станций
const stationRadii = new Map();
state.stations.forEach(st => {
const cols = stColors(st.id);
const r = cols.length > 1 ? lWidth + 5 : lWidth + 1;
stationRadii.set(st.id, r);
const isDimmed = hasRoute && !activeRoute.stationIds.has(st.id);
ctx.save();
if (isDimmed) ctx.globalAlpha = 0.3;
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
if ((tool === 'transfer' && activeSt && activeSt.id === st.id) || (tool === 'route' && routeStartId === st.id)) {
ctx.globalAlpha = 1;
ctx.strokeStyle = '#3b82f6';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.arc(st.x, st.y, r + 7, 0, Math.PI * 2);
ctx.stroke();
}
ctx.restore();
});
// 5. Подписи станций
const placedBoxes = [];
state.stations.forEach(st => {
const r = stationRadii.get(st.id) || lWidth + 2;
placedBoxes.push({ x1: st.x - r - 2, y1: st.y - r - 2, x2: st.x + r + 2, y2: st.y + r + 2 });
});
state.stations.forEach(st => {
if (!st.name) return;
const r = stationRadii.get(st.id) || lWidth + 2;
const lbl = computeSmartLabel(st, r, placedBoxes);
placedBoxes.push(lbl.box);
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
ctx.restore();
}
// ==========================================
// УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ И СОБЫТИЯМИ
// ==========================================
const mainMenu = document.getElementById('mainMenu');
const settingsModal = document.getElementById('settingsModal');
document.getElementById('playBtn').addEventListener('click', () => {
mainMenu.classList.add('hidden');
});
document.getElementById('backToMenuBtn').addEventListener('click', () => {
activeSt = null;
mainMenu.classList.remove('hidden');
});
document.getElementById('openSettingsBtn').addEventListener('click', () => {
settingsModal.classList.remove('hidden');
});
document.getElementById('inGameSettingsBtn').addEventListener('click', () => {
settingsModal.classList.remove('hidden');
});
document.getElementById('closeSettingsBtn').addEventListener('click', () => {
settingsModal.classList.add('hidden');
});
document.getElementById('closeRouteBtn').addEventListener('click', () => {
clearRoute();
draw();
});
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
// События холста
canvas.addEventListener('mousedown', e => {
const w = toWorld(e.clientX, e.clientY);
if (e.button === 1 || space) {
panning = true;
panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y };
return;
}
if (e.button === 2) {
activeSt = null;
clearRoute();
draw();
return;
}
if (tool === 'move') {
const h = hitSt(w);
if (h) { save(); dragSt = h; }
else { panning = true; panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y }; }
} else if (tool === 'line') {
clearRoute();
save();
let h = hitSt(w);
if (!h) {
const sn = activeSt ? snapAngle(activeSt, w) : snapGrid(w);
h = { id: Date.now() + Math.random(), x: sn.x, y: sn.y, name: 'Станция ' + (state.stations.length + 1) };
state.stations.push(h);
}
if (activeSt && activeSt.id !== h.id) {
state.segments.push({ id: Date.now() + Math.random(), from: activeSt.id, to: h.id, color });
}
activeSt = h;
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
save();
state.transfers.push({ id: Date.now() + Math.random(), from: activeSt.id, to: h.id });
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
panel.classList.remove('hidden');
document.getElementById('routeTitle').textContent = '🧭 Старт: ' + h.name;
document.getElementById('routeDetails').textContent = 'Нажмите на конечную станцию для построения маршрута...';
draw();
} else if (routeStartId !== h.id) {
const startSt = state.stations.find(s => s.id === routeStartId);
const found = findShortestRoute(routeStartId, h.id);
activeRoute = found;
if (startSt) showRouteSummary(startSt, h, found);
routeStartId = null;
draw();
}
} else if (tool === 'river') {
save();
curRiver = [w];
} else if (tool === 'erase') {
clearRoute();
// 1. Попадание в станцию
const h = hitSt(w);
if (h) {
save();
state.stations = state.stations.filter(s => s.id !== h.id);
state.segments = state.segments.filter(g => g.from !== h.id && g.to !== h.id);
state.transfers = state.transfers.filter(tr => tr.from !== h.id && tr.to !== h.id);
if (activeSt && activeSt.id === h.id) activeSt = null;
updateLegendUI();
draw();
return;
}
// 2. Попадание в отдельный сегмент ветки
const hitSeg = state.segments.find(seg => {
const s1 = state.stations.find(s => s.id === seg.from);
const s2 = state.stations.find(s => s.id === seg.to);
return s1 && s2 && distToSegment(w, s1, s2) <= Math.max(settings.lineWidth, 10);
});
if (hitSeg) {
save();
state.segments = state.segments.filter(seg => seg.id !== hitSeg.id);
updateLegendUI();
draw();
return;
}
// 3. Попадание в пешеходный переход
const hitTr = state.transfers.find(tr => {
const s1 = state.stations.find(s => s.id === tr.from);
const s2 = state.stations.find(s => s.id === tr.to);
return s1 && s2 && distToSegment(w, s1, s2) <= 14;
});
if (hitTr) {
save();
state.transfers = state.transfers.filter(tr => tr.id !== hitTr.id);
draw();
return;
}
// 4. Попадание в реку
const hitRiver = state.rivers.some(rv => rv.some(p => Math.hypot(p.x - w.x, p.y - w.y) < 25));
if (hitRiver) {
save();
state.rivers = state.rivers.filter(rv => rv.some(p => Math.hypot(p.x - w.x, p.y - w.y) < 25) === false);
draw();
}
}
});
canvas.addEventListener('mousemove', e => {
mouseW = toWorld(e.clientX, e.clientY);
if (panning) { cam.x = e.clientX - panStart.x; cam.y = e.clientY - panStart.y; draw(); return; }
if (dragSt) { const sn = snapGrid(mouseW); dragSt.x = sn.x; dragSt.y = sn.y; draw(); return; }
if (curRiver) {
const last = curRiver.at(-1);
if (last && Math.hypot(mouseW.x - last.x, mouseW.y - last.y) > 15) { curRiver.push(mouseW); draw(); }
return;
}
if ((tool === 'line' || tool === 'transfer') && activeSt) draw();
});
addEventListener('mouseup', () => {
panning = false;
dragSt = null;
if (curRiver) {
if (curRiver.length > 1) state.rivers.push(curRiver);
curRiver = null;
try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
draw();
}
});
canvas.addEventListener('dblclick', e => {
const h = hitSt(toWorld(e.clientX, e.clientY));
if (h) {
const n = prompt('Название станции:', h.name);
if (n !== null) { save(); h.name = n.trim(); draw(); }
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
if (!settingsModal.classList.contains('hidden')) settingsModal.classList.add('hidden');
else { activeSt = null; clearRoute(); draw(); }
}
if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.addEventListener('click', () => {
document.querySelectorAll('.tool-btn[data-tool]').forEach(x => x.classList.remove('active'));
b.classList.add('active');
tool = b.dataset.tool;
activeSt = null;
if (tool !== 'route') clearRoute();
draw();
}));
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
save();
state = { stations: [], segments: [], transfers: [], rivers: [], lineNames: {} };
activeSt = null;
clearRoute();
try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
updateLegendUI();
draw();
}
});
// Экспорт в PNG (с отрисовкой легенды в углу картинки)
document.getElementById('exportPngBtn').addEventListener('click', () => {
const prevRoute = activeRoute;
activeRoute = null;
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
ctx.fillText(line.index + '. ' + line.name, pad + 42, y);
});
ctx.restore();
}
const a = document.createElement('a');
a.download = 'metro-map.png';
a.href = canvas.toDataURL('image/png');
a.click();
activeRoute = prevRoute;
draw();
});
// Экспорт в JSON
document.getElementById('exportJsonBtn').addEventListener('click', () => {
const payload = {
project: 'Metro Project',
version: '0.3',
exportedAt: new Date().toISOString(),
settings,
state
};
const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.download = 'metro-map.json';
a.href = url;
a.click();
URL.revokeObjectURL(url);
});
// Импорт из JSON
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
save();
state = normalizeState(nextState);
if (parsed.settings) {
settings = Object.assign(settings, parsed.settings);
saveSettings();
applySettingsToUI();
}
activeSt = null;
clearRoute();
try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (err) {}
updateLegendUI();
draw();
} catch (err) {
alert('Ошибка при чтении JSON-файла.');
}
};
reader.readAsText(file);
});
applySettingsToUI();
updateLegendUI();
resize();