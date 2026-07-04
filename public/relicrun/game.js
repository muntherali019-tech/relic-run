// Relic Run — a retro grid chase through real archaeology.
// Movement is Pac-Man style: entities glide tile-to-tile; direction changes
// apply at tile centres. Guards sweep the level systematically from the
// entrance side to the exit and back (so pressure always builds from behind),
// switching to a direct chase whenever the runner comes within range.
import { LEVELS } from "./levels.js";

const COLS = 21, ROWS = 13;
const PLAYER_SPEED = 4.2;           // tiles per second
const CHASE_RANGE = 7;              // BFS distance at which a guard locks on
const LOSE_RANGE = 11;              // distance at which a guard gives up
const SHARD_SCORE = 10, ARTIFACT_SCORE = 250, LEVEL_SCORE = 500;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = {
  level: document.getElementById("hud-level"),
  score: document.getElementById("hud-score"),
  lives: document.getElementById("hud-lives"),
  relics: document.getElementById("hud-relics"),
};
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const overlayHint = document.getElementById("overlay-hint");
const toast = document.getElementById("toast");

let TILE = 32;
function fit() {
  const w = Math.min(window.innerWidth - 16, 840);
  TILE = Math.max(18, Math.floor(w / COLS));
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
}
window.addEventListener("resize", fit);
fit();

/* ---------- grid helpers ---------- */
const key = (x, y) => y * COLS + x;
let walls, shards, artifacts, exitTile, playerStart, guardSpawns;

function parseLevel(def) {
  walls = new Set(); shards = new Set(); artifacts = []; guardSpawns = [];
  let ai = 0;
  def.grid.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "#") { walls.add(key(x, y)); return; }
    if (c === "P") playerStart = { x, y };
    else if (c === "E") exitTile = { x, y };
    else if (c === "G") guardSpawns.push({ x, y });
    else if (c === "A") artifacts.push({ x, y, taken: false, ...def.artifacts[ai++] });
    if (c === "." ) shards.add(key(x, y));
  }));
}
const isWall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || walls.has(key(x, y));

// Breadth-first path over the grid; small boards, so recomputing is cheap.
function bfsPath(from, to) {
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Map([[key(from.x, from.y), null]]);
  const q = [[from.x, from.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (isWall(nx, ny) || prev.has(k)) continue;
      prev.set(k, key(x, y));
      if (nx === to.x && ny === to.y) {
        const path = [];
        for (let cur = k; cur !== key(from.x, from.y); cur = prev.get(cur))
          path.unshift({ x: cur % COLS, y: (cur / COLS) | 0 });
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}
const bfsDistance = (a, b) => { const p = bfsPath(a, b); return p ? p.length : Infinity; };

// The guards' systematic route: corridor waypoints ordered by column from the
// level entrance (left, where the runner starts) to the exit (right), so a
// full patrol is one sweep of the whole level, then back to the beginning.
function buildSweep() {
  const pts = [];
  for (let x = 1; x < COLS - 1; x += 3)
    for (let y = 1; y < ROWS - 1; y++)
      if (!isWall(x, y)) { pts.push({ x, y }); break; }
  return pts;
}

/* ---------- game state ---------- */
const state = {
  mode: "title",          // title | intro | play | dead | gameover | won
  levelIndex: 0, score: 0, lives: 3,
  player: null, guards: [], sweep: [],
  exitOpen: false, toastTimer: 0,
};

function makeMover(x, y, speed) {
  return { x, y, px: x, py: y, dir: { x: 0, y: 0 }, want: { x: 0, y: 0 }, speed, progress: 0, target: null };
}

function loadLevel(i) {
  const def = LEVELS[i];
  parseLevel(def);
  state.player = makeMover(playerStart.x, playerStart.y, PLAYER_SPEED);
  state.sweep = buildSweep();
  state.guards = guardSpawns.map((g, gi) => ({
    ...makeMover(g.x, g.y, def.guardSpeed),
    home: { ...g }, mode: "sweep",
    // Stagger where each guard begins its sweep so they fan out across the level.
    sweepIdx: Math.floor((gi * state.sweep.length) / Math.max(guardSpawns.length, 1) / 2),
    path: [],
  }));
  state.exitOpen = false;
  updateHud();
}

function updateHud() {
  const def = LEVELS[state.levelIndex];
  const got = artifacts.filter(a => a.taken).length;
  hud.level.textContent = `L${state.levelIndex + 1} · ${def.name}`;
  hud.score.textContent = String(state.score).padStart(5, "0");
  hud.lives.textContent = "❤".repeat(state.lives) || "—";
  hud.relics.textContent = `🏺 ${got}/${artifacts.length}${state.exitOpen ? " · EXIT OPEN →" : ""}`;
}

function showToast(html, ms = 4200) {
  toast.innerHTML = html;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}

function showOverlay(title, body, hint) {
  overlayTitle.innerHTML = title;
  overlayBody.innerHTML = body;
  overlayHint.textContent = hint;
  overlay.classList.add("show");
}
const hideOverlay = () => overlay.classList.remove("show");

/* ---------- movement ---------- */
function stepMover(m, dt) {
  // Glide toward the next tile; when centred, adopt the queued direction if open.
  if (m.dir.x === 0 && m.dir.y === 0) {
    if (!isWall(m.x + m.want.x, m.y + m.want.y) && (m.want.x || m.want.y)) m.dir = { ...m.want };
    else return;
  }
  m.progress += m.speed * dt;
  while (m.progress >= 1) {
    m.progress -= 1;
    m.x += m.dir.x; m.y += m.dir.y;
    const turn = !isWall(m.x + m.want.x, m.y + m.want.y) && (m.want.x || m.want.y);
    if (turn) m.dir = { ...m.want };
    if (isWall(m.x + m.dir.x, m.y + m.dir.y)) { m.dir = { x: 0, y: 0 }; m.progress = 0; }
  }
  m.px = m.x + m.dir.x * m.progress;
  m.py = m.y + m.dir.y * m.progress;
}

function guardThink(g) {
  const pTile = { x: state.player.x, y: state.player.y };
  const dist = bfsDistance({ x: g.x, y: g.y }, pTile);
  if (g.mode === "sweep" && dist <= CHASE_RANGE) g.mode = "chase";
  else if (g.mode === "chase" && dist > LOSE_RANGE) g.mode = "sweep";

  let target;
  if (g.mode === "chase") target = pTile;
  else {
    target = state.sweep[g.sweepIdx];
    if (g.x === target.x && g.y === target.y) {
      g.sweepIdx = (g.sweepIdx + 1) % state.sweep.length;   // reached the end → begin again
      target = state.sweep[g.sweepIdx];
    }
  }
  const path = bfsPath({ x: g.x, y: g.y }, target);
  if (path && path.length) {
    const n = path[0];
    g.want = { x: n.x - g.x, y: n.y - g.y };
  }
}

function caught() {
  state.lives -= 1;
  updateHud();
  if (state.lives <= 0) {
    state.mode = "gameover";
    showOverlay("GAME OVER", `The guards recovered every relic.<br>Final score <b>${state.score}</b>.`, "Press Enter or tap to try again");
    return;
  }
  // The runner respawns at the entrance and the guards restart their sweep
  // from the beginning of the level — the chase builds up all over again.
  const def = LEVELS[state.levelIndex];
  state.player = makeMover(playerStart.x, playerStart.y, PLAYER_SPEED);
  state.guards.forEach((g, gi) => {
    Object.assign(g, makeMover(g.home.x, g.home.y, def.guardSpeed));
    g.home = g.home; g.mode = "sweep";
    g.sweepIdx = Math.floor((gi * state.sweep.length) / Math.max(state.guards.length, 1) / 2);
  });
  showToast("👮 Caught! Back to the entrance…", 2000);
}

/* ---------- update ---------- */
function update(dt) {
  if (state.mode !== "play") return;
  const p = state.player;
  stepMover(p, dt);

  // pick up shards + artifacts at the tile the runner occupies
  const k = key(p.x, p.y);
  if (shards.delete(k)) { state.score += SHARD_SCORE; updateHud(); }
  for (const a of artifacts) {
    if (!a.taken && a.x === p.x && a.y === p.y) {
      a.taken = true;
      state.score += ARTIFACT_SCORE;
      if (artifacts.every(x => x.taken)) state.exitOpen = true;
      showToast(`<b>${a.icon} ${a.name}</b><br>${a.fact}`);
      updateHud();
    }
  }
  if (state.exitOpen && p.x === exitTile.x && p.y === exitTile.y) {
    state.score += LEVEL_SCORE;
    if (state.levelIndex + 1 >= LEVELS.length) {
      state.mode = "won";
      showOverlay("EXPEDITION COMPLETE 🏆",
        `Every artifact is safe in the museum.<br>Final score <b>${state.score}</b>.`,
        "Press Enter or tap to play again");
    } else {
      state.levelIndex += 1;
      startIntro();
    }
    return;
  }

  for (const g of state.guards) {
    if (g.dir.x === 0 && g.dir.y === 0) guardThink(g);
    else if (g.progress === 0) guardThink(g);
    stepMover(g, dt);
    if (Math.hypot(g.px - p.px, g.py - p.py) < 0.6) { caught(); return; }
  }
}

/* ---------- render ---------- */
let anim = 0;
function draw() {
  const def = LEVELS[state.levelIndex];
  anim += 0.1;
  ctx.fillStyle = def.floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // walls, Pac-Man style: glowing rounded blocks
  ctx.strokeStyle = def.wall;
  ctx.lineWidth = Math.max(2, TILE * 0.14);
  ctx.shadowColor = def.glow; ctx.shadowBlur = 8;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!walls.has(key(x, y))) continue;
    ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
  }
  ctx.shadowBlur = 0;

  // relic shards (dots)
  ctx.fillStyle = def.glow;
  shards.forEach(k => {
    const x = k % COLS, y = (k / COLS) | 0;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, Math.max(1.5, TILE * 0.06), 0, Math.PI * 2);
    ctx.fill();
  });

  // artifacts
  ctx.font = `${Math.floor(TILE * 0.7)}px serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const a of artifacts) if (!a.taken) {
    const bob = Math.sin(anim + a.x) * TILE * 0.06;
    ctx.fillText(a.icon, a.x * TILE + TILE / 2, a.y * TILE + TILE / 2 + bob);
  }

  // exit door
  const ex = exitTile.x * TILE, ey = exitTile.y * TILE;
  ctx.fillStyle = state.exitOpen ? "#39d98a" : "#333";
  ctx.fillRect(ex + 5, ey + 4, TILE - 10, TILE - 8);
  ctx.fillStyle = def.floor;
  if (state.exitOpen) ctx.fillRect(ex + 9, ey + 8, TILE - 18, TILE - 12);

  // player: the runner — a chomping explorer
  const p = state.player;
  if (p) {
    const cx = p.px * TILE + TILE / 2, cy = p.py * TILE + TILE / 2;
    const mouth = (Math.sin(anim * 2.2) + 1) / 2 * 0.55 + 0.05;
    const ang = Math.atan2(p.dir.y, p.dir.x || (p.dir.y ? 0 : 1));
    ctx.fillStyle = "#ffd23e";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, TILE * 0.38, ang + mouth, ang - mouth + Math.PI * 2);
    ctx.closePath(); ctx.fill();
    // explorer hat brim
    ctx.fillStyle = "#7a5a2b";
    ctx.fillRect(cx - TILE * 0.32, cy - TILE * 0.42, TILE * 0.64, TILE * 0.12);
  }

  // guards: ghost-shaped sentries; red-eyed while chasing
  for (const g of state.guards) {
    const cx = g.px * TILE + TILE / 2, cy = g.py * TILE + TILE / 2, r = TILE * 0.36;
    ctx.fillStyle = def.guardColor;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    const base = cy + r * 0.85;
    ctx.lineTo(cx + r, base);
    for (let i = 2; i >= -2; i--) ctx.lineTo(cx + (i / 2.5) * r, base - (Math.abs(i) % 2 ? r * 0.25 : 0));
    ctx.closePath(); ctx.fill();
    const look = g.dir.x * r * 0.18;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx - r * 0.35 + look, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35 + look, cy - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.mode === "chase" ? "#e33" : "#223";
    ctx.beginPath(); ctx.arc(cx - r * 0.35 + look * 1.6, cy - r * 0.2, r * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35 + look * 1.6, cy - r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
}

/* ---------- flow ---------- */
function startIntro() {
  const def = LEVELS[state.levelIndex];
  loadLevel(state.levelIndex);
  state.mode = "intro";
  showOverlay(`LEVEL ${state.levelIndex + 1} — ${def.name.toUpperCase()}`,
    `<span class="era">${def.era}</span><br>${def.intro}<br><br>Grab all <b>3 artifacts</b> to open the exit. Dodge the <b>${def.guardName}s</b>.`,
    "Press Enter or tap to begin");
}

function begin() {
  if (state.mode === "title" || state.mode === "gameover" || state.mode === "won") {
    state.levelIndex = 0; state.score = 0; state.lives = 3;
    startIntro();
  } else if (state.mode === "intro") {
    hideOverlay();
    state.mode = "play";
  }
}

/* ---------- input ---------- */
const DIRS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { begin(); e.preventDefault(); return; }
  const d = DIRS[e.key];
  if (d && state.player) { state.player.want = { ...d }; e.preventDefault(); }
});
overlay.addEventListener("click", begin);
// swipe steering for touch devices
let touchStart = null;
canvas.addEventListener("touchstart", (e) => { touchStart = e.touches[0]; }, { passive: true });
canvas.addEventListener("touchend", (e) => {
  if (!touchStart || !state.player) return;
  const dx = e.changedTouches[0].clientX - touchStart.clientX;
  const dy = e.changedTouches[0].clientY - touchStart.clientY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  state.player.want = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}, { passive: true });

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

loadLevel(0);
showOverlay("RELIC RUN",
  "Hunt real archaeological treasures through five ancient sites — while the guards sweep each level from entrance to exit, right on your heels.",
  "Press Enter or tap to start · Arrows / WASD / swipe to move");
requestAnimationFrame(frame);
