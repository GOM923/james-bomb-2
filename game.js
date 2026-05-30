const TILE = 48;
const COLS = 15;
const ROWS = 13;

const EMPTY = 0;
const WALL  = 1;
const BLOCK = 2;

const canvas = document.getElementById('gameCanvas');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext('2d');

// ── Web Audio ─────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, gainVal = 0.3, startDelay = 0) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);
  gain.gain.setValueAtTime(gainVal, audioCtx.currentTime + startDelay);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + startDelay + duration);
  osc.start(audioCtx.currentTime + startDelay);
  osc.stop(audioCtx.currentTime + startDelay + duration);
}

function soundBombPlace() {
  playTone(220, 'sine', 0.12, 0.2);
}

function soundExplosion() {
  // Noise burst via buffer
  const bufSize = audioCtx.sampleRate * 0.35;
  const buf  = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
}

function soundBlockDestroy() {
  playTone(180, 'sawtooth', 0.15, 0.25);
  playTone(120, 'sawtooth', 0.12, 0.2, 0.08);
}

function soundChain() {
  playTone(440, 'square', 0.1, 0.15);
  playTone(330, 'square', 0.1, 0.15, 0.1);
}

// ── Grid ─────────────────────────────────────────────────
const grid = [];

function buildGrid() {
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        grid[r][c] = WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        grid[r][c] = WALL;
      } else {
        grid[r][c] = EMPTY;
      }
    }
  }
  const safeZone = [[1,1],[1,2],[2,1]];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === EMPTY) {
        const safe = safeZone.some(([sr, sc]) => sr === r && sc === c);
        if (!safe && Math.random() < 0.65) grid[r][c] = BLOCK;
      }
    }
  }
}

// ── Player ───────────────────────────────────────────────
const player = {
  row: 1, col: 1,
  x: TILE,  y: TILE,
  speed: 3,
  targetX: TILE, targetY: TILE,
  moving: false,
  bombRange: 2,
  maxBombs: 1,
};

// ── Bombs ─────────────────────────────────────────────────
// { row, col, timer, range }
const bombs = [];

// ── Explosions ────────────────────────────────────────────
// { row, col, life }  — life counts down in ms
const explosions = [];
const EXPLOSION_LIFE = 600; // ms

// ── Particles ─────────────────────────────────────────────
// { x, y, vx, vy, life, maxLife, color }
const particles = [];

function spawnParticles(cx, cy, color) {
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400 + Math.random() * 200,
      maxLife: 600,
      color,
    });
  }
}

// ── Input ────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

function getInput() {
  if (keys['ArrowUp']    || keys['w'] || keys['W']) return { dr: -1, dc:  0 };
  if (keys['ArrowDown']  || keys['s'] || keys['S']) return { dr:  1, dc:  0 };
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) return { dr:  0, dc: -1 };
  if (keys['ArrowRight'] || keys['d'] || keys['D']) return { dr:  0, dc:  1 };
  return null;
}

let spaceWasDown = false;

// ── Collision ─────────────────────────────────────────────
function isWalkable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  if (grid[row][col] !== EMPTY) return false;
  // Can walk over own bomb only if already standing on it
  const hasBomb = bombs.some(b => b.row === row && b.col === col);
  if (hasBomb && !(row === player.row && col === player.col)) return false;
  return true;
}

// ── Explosion logic ───────────────────────────────────────
function triggerExplosion(bomb) {
  soundExplosion();
  const { row, col, range } = bomb;

  // Center cell
  markExplosion(row, col);

  // Propagate in 4 directions
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i <= range; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
      if (grid[r][c] === WALL) break;
      if (grid[r][c] === BLOCK) {
        grid[r][c] = EMPTY;
        markExplosion(r, c);
        soundBlockDestroy();
        spawnParticles(c * TILE + TILE / 2, r * TILE + TILE / 2, '#8b5e3c');
        break; // fire stops at destroyed block
      }
      markExplosion(r, c);
    }
  }

  // Chain reaction: detonate other bombs in blast radius
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    if (b === bomb) continue;
    if (explosions.some(e => e.row === b.row && e.col === b.col)) {
      bombs.splice(i, 1);
      soundChain();
      triggerExplosion(b);
    }
  }
}

function markExplosion(row, col) {
  // Avoid duplicate cells
  if (!explosions.some(e => e.row === row && e.col === col)) {
    explosions.push({ row, col, life: EXPLOSION_LIFE });
    spawnParticles(col * TILE + TILE / 2, row * TILE + TILE / 2, '#ff6600');
  }
}

// ── Update ────────────────────────────────────────────────
let lastTime = 0;

function update(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  // ── Player movement ──
  if (!player.moving) {
    const dir = getInput();
    if (dir) {
      const nr = player.row + dir.dr;
      const nc = player.col + dir.dc;
      if (isWalkable(nr, nc)) {
        player.row = nr;
        player.col = nc;
        player.targetX = nc * TILE;
        player.targetY = nr * TILE;
        player.moving = true;
      }
    }
  }

  if (player.moving) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= player.speed) {
      player.x = player.targetX;
      player.y = player.targetY;
      player.moving = false;
    } else {
      player.x += (dx / dist) * player.speed;
      player.y += (dy / dist) * player.speed;
    }
  }

  // ── Place bomb (Space) ──
  const spaceDown = keys[' '];
  if (spaceDown && !spaceWasDown) {
    const activeBombs = bombs.length;
    const alreadyHere = bombs.some(b => b.row === player.row && b.col === player.col);
    if (activeBombs < player.maxBombs && !alreadyHere) {
      bombs.push({ row: player.row, col: player.col, timer: 3000, range: player.bombRange });
      soundBombPlace();
    }
  }
  spaceWasDown = spaceDown;

  // ── Bomb countdown ──
  for (let i = bombs.length - 1; i >= 0; i--) {
    bombs[i].timer -= dt;
    if (bombs[i].timer <= 0) {
      const b = bombs.splice(i, 1)[0];
      triggerExplosion(b);
    }
  }

  // ── Explosion lifetime ──
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].life -= dt;
    if (explosions[i].life <= 0) explosions.splice(i, 1);
  }

  // ── Particles ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravity
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ── Draw ──────────────────────────────────────────────────
function drawGrid() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = grid[r][c];
      ctx.fillStyle = type === WALL ? '#555566' : type === BLOCK ? '#8b5e3c' : '#2d4a22';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
      if (type === BLOCK) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
      }
    }
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const alpha = Math.min(1, e.life / (EXPLOSION_LIFE * 0.4));
    // Outer glow
    const grad = ctx.createRadialGradient(
      e.col * TILE + TILE / 2, e.row * TILE + TILE / 2, 2,
      e.col * TILE + TILE / 2, e.row * TILE + TILE / 2, TILE / 2
    );
    grad.addColorStop(0, `rgba(255,255,100,${alpha})`);
    grad.addColorStop(0.5, `rgba(255,100,0,${alpha * 0.85})`);
    grad.addColorStop(1, `rgba(255,50,0,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(e.col * TILE, e.row * TILE, TILE, TILE);
  }
}

function drawBombs() {
  for (const b of bombs) {
    const cx = b.col * TILE + TILE / 2;
    const cy = b.row * TILE + TILE / 2;
    const frac = Math.max(0, b.timer / 3000); // 1 → 0

    // Pulsing size
    const pulse = 1 + 0.12 * Math.sin(Date.now() / 80);
    const radius = (TILE / 2 - 6) * pulse;

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Fuse glow (red → yellow as timer runs out)
    const fuseR = Math.round(255);
    const fuseG = Math.round(frac * 200);
    ctx.strokeStyle = `rgb(${fuseR},${fuseG},0)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fuse dot
    ctx.fillStyle = `rgb(${fuseR},${fuseG},0)`;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.5, cy - radius * 0.8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const pad = 5;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.roundRect(player.x + pad, player.y + pad, TILE - pad * 2, TILE - pad * 2, 8);
  ctx.fill();
  ctx.strokeStyle = '#c07800';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(player.x + 15, player.y + 17, 3, 0, Math.PI * 2);
  ctx.arc(player.x + 33, player.y + 17, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(4, 4, 180, 28);
  ctx.fillStyle = '#f5a623';
  ctx.font = '13px Arial';
  ctx.fillText(`Bombes: ${player.maxBombs - bombs.length}/${player.maxBombs}  Portée: ${player.bombRange}`, 10, 22);
}

// ── Loop ──────────────────────────────────────────────────
function loop(ts) {
  update(ts);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawExplosions();
  drawBombs();
  drawParticles();
  drawPlayer();
  drawHUD();
  requestAnimationFrame(loop);
}

buildGrid();
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
