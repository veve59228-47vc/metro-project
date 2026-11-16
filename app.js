const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let state = { stations: [], segments: [], rivers: [] };
let history = [];

// Настройки холста
let settings = {
  gridSize: 40,
  lineWidth: 8,
  showGrid: true,
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

  state.stations.forEach(st => {
    const cols = stColors(st.id);
    const r = cols.length > 1 ? lWidth + 5 : lWidth + 1;
    ctx.fillStyle = dark ? '#0f172a' : '#fff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, r + 3, 0, Math.PI * 2);
    ctx.fill();

    if (cols.length <= 1) {
      ctx.strokeStyle = cols || color;
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

    if (st.name) {
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText(st.name, st.x, st.y - r - 8);
    }
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
applySettingsToUI();
resize();