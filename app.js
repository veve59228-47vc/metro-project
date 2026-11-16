const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let state = { stations: [], segments: [], rivers: [] };
let history = [];

// Настройки холста
let settings = {
  gridSize: 40,
  lineWidth: 8,
  showGrid: true,
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
  if (saved) state = JSON.parse(saved);
  const savedSet = localStorage.getItem('metro_settings_v1');
  if (savedSet) settings = Object.assign(settings, JSON.parse(savedSet));
} catch (e) {}

function applySettingsToUI() {
  document.getElementById('gridSizeInput').value = settings.gridSize;
  document.getElementById('gridSizeVal').textContent = settings.gridSize + ' px';
  document.getElementById('lineWidthInput').value = settings.lineWidth;
  document.getElementById('lineWidthVal').textContent = settings.lineWidth + ' px';
  document.getElementById('showGridInput').checked = settings.showGrid;
  document.getElementById('smartLabelsInput').checked = settings.smartLabels;
  document.getElementById('darkThemeInput').checked = settings.darkTheme;
  document.body.classList.toggle('dark', settings.darkTheme);
}

function undo() {
  if (!history.length) return;
  state = JSON.parse(history.pop());
  activeSt = null;
  try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
  draw();
}

const toWorld = (sx, sy) => ({ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom });
const snapGrid = p => ({
  x: Math.round(p.x / settings.gridSize) * settings.gridSize,
  y: Math.round(p.y / settings.gridSize) * settings.gridSize
});

function snapAngle(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 10) return a;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return snapGrid({ x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d });
}

const hitSt = (p, r = 22) => state.stations.find(s => Math.hypot(s.x - p.x, s.y - p.y) <= r);
const stColors = id => [...new Set(state.segments.filter(g => g.from === id || g.to === id).map(g => g.color))];

// Проверка пересечения прямоугольников для умных подписей
function boxesOverlap(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

// Углы всех веток, выходящих из станции
function getIncidentAngles(st) {
  const angles = [];
  state.segments.forEach(seg => {
    let otherId = null;
    if (seg.from === st.id) otherId = seg.to;
    else if (seg.to === st.id) otherId = seg.from;
    if (!otherId) return;
    const other = state.stations.find(s => s.id === otherId);
    if (other) {
      angles.push(Math.atan2(other.y - st.y, other.x - st.x));
    }
  });
  return angles;
}

// Минимальная угловая дистанция до ближайшей ветки
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

// Расчет оптимальной позиции и поворота подписи станции
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

  // Кандидаты: 8 позиций вокруг станции + диагональные повороты на -45°
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
      // Габаритный прямоугольник для текста под -45°
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
    // Штраф за наложение на другую подпись и за попадание на линию метро
    const linePenalty = clearance < 0.35 ? 40 : 0;
    const score = clearance * 25 - overlaps * 120 - linePenalty - c.prio * 1.5;

    if (score > bestScore) {
      bestScore = score;
      best = { x: lx, y: ly, align: c.align, baseline: c.baseline, angle: c.angle, box };
    }
  });

  return best;
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

  const pairs = {};
  state.segments.forEach(g => {
    const s1 = state.stations.find(s => s.id === g.from);
    const s2 = state.stations.find(s => s.id === g.to);
    if (!s1 || !s2) return;
    const k = g.from < g.to ? g.from + '_' + g.to : g.to + '_' + g.from;
    const idx = pairs[k] || 0;
    pairs[k] = idx + 1;
    const ang = Math.atan2(s2.y - s1.y, s2.x - s1.x);
    const off = idx ? (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * lWidth : 0;
    const ox = -Math.sin(ang) * off;
    const oy = Math.cos(ang) * off;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = lWidth;
    ctx.beginPath();
    ctx.moveTo(s1.x + ox, s1.y + oy);
    ctx.lineTo(s2.x + ox, s2.y + oy);
    ctx.stroke();
  });

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

  // Сначала рисуем круги всех станций, затем поверх них — подписи
  const stationRadii = new Map();
  state.stations.forEach(st => {
    const cols = stColors(st.id);
    const r = cols.length > 1 ? lWidth + 5 : lWidth + 1;
    stationRadii.set(st.id, r);

    ctx.fillStyle = dark ? '#0f172a' : '#fff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, r + 3, 0, Math.PI * 2);
    ctx.fill();

    if (cols.length <= 1) {
      ctx.strokeStyle = cols[0] || color;
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
  });

  // Отрисовка умных подписей станций
  const placedBoxes = [];
  // Добавляем сами круги станций как препятствия для текста
  state.stations.forEach(st => {
    const r = stationRadii.get(st.id) || lWidth + 2;
placedBoxes.push({ x1: st.x - r - 2, y1: st.y - r - 2, x2: st.x + r + 2, y2: st.y + r + 2 });
});
state.stations.forEach(st => {
if (!st.name) return;
const r = stationRadii.get(st.id) || lWidth + 2;
const lbl = computeSmartLabel(st, r, placedBoxes);
placedBoxes.push(lbl.box);
ctx.save();
ctx.translate(lbl.x, lbl.y);
if (lbl.angle !== 0) ctx.rotate(lbl.angle);
ctx.font = '600 13px system-ui, sans-serif';
ctx.textAlign = lbl.align;
ctx.textBaseline = lbl.baseline;
// Лёгкая обводка под цвет фона для читаемости поверх веток и рек
ctx.lineWidth = 3.5;
ctx.strokeStyle = dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(244, 246, 248, 0.9)';
ctx.strokeText(st.name, 0, 0);
ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
ctx.fillText(st.name, 0, 0);
ctx.restore();
});
ctx.restore();
}
// Управление меню и настройками
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
draw();
return;
}
if (tool === 'move') {
const h = hitSt(w);
if (h) { save(); dragSt = h; }
else { panning = true; panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y }; }
} else if (tool === 'line') {
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
draw();
} else if (tool === 'river') {
save();
curRiver = [w];
} else if (tool === 'erase') {
save();
const h = hitSt(w);
if (h) {
state.stations = state.stations.filter(s => s.id !== h.id);
state.segments = state.segments.filter(g => g.from !== h.id && g.to !== h.id);
if (activeSt && activeSt.id === h.id) activeSt = null;
} else {
state.rivers = state.rivers.filter(rv => rv.some(p => Math.hypot(p.x - w.x, p.y - w.y) < 25) === false);
}
draw();
}
});
canvas.addEventListener('mousemove', e => {
mouseW = toWorld(e.clientX, e.clientY);
if (panning) { cam.x = e.clientX - panStart.x; cam.y = e.clientY - panStart.y; draw(); return; }
if (dragSt) { const sn = snapGrid(mouseW); dragSt.x = sn.x; dragSt.y = sn.y; draw(); return; }
if (curRiver) {
const last = curRiver[curRiver.length - 1];
if (last && Math.hypot(mouseW.x - last.x, mouseW.y - last.y) > 15) { curRiver.push(mouseW); draw(); }
return;
}
if (tool === 'line' && activeSt) draw();
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
if (e.code === 'Escape') {
if (!settingsModal.classList.contains('hidden')) settingsModal.classList.add('hidden');
else { activeSt = null; draw(); }
}
if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.addEventListener('click', () => {
document.querySelectorAll('.tool-btn[data-tool]').forEach(x => x.classList.remove('active'));
b.classList.add('active');
tool = b.dataset.tool;
activeSt = null;
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
state = { stations: [], segments: [], rivers: [] };
activeSt = null;
try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (e) {}
draw();
}
});
document.getElementById('exportPngBtn').addEventListener('click', () => {
const a = document.createElement('a');
a.download = 'metro-map.png';
a.href = canvas.toDataURL('image/png');
a.click();
});
// Экспорт в JSON
document.getElementById('exportJsonBtn').addEventListener('click', () => {
const payload = {
project: 'Metro Project',
version: '0.2',
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
const file = e.target.files[0];
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
state = {
stations: nextState.stations,
segments: nextState.segments,
rivers: Array.isArray(nextState.rivers) ? nextState.rivers : []
};
if (parsed.settings) {
settings = Object.assign(settings, parsed.settings);
saveSettings();
applySettingsToUI();
}
activeSt = null;
try { localStorage.setItem('metro_v1', JSON.stringify(state)); } catch (err) {}
draw();
} catch (err) {
alert('Ошибка при чтении JSON-файла.');
}
};
reader.readAsText(file);
});
applySettingsToUI();
resize();