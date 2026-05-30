const TILE = 48;
const COLS = 15;
const ROWS = 13;

const EMPTY = 0;
const WALL  = 1;
const BLOCK = 2;

// Power-up types
const PU_BOMB  = 'bomb';   // +1 max bomb
const PU_RANGE = 'range';  // +1 explosion range
const PU_SPEED = 'speed';  // +1 speed
const PU_LIFE  = 'life';   // +1 life

const canvas = document.getElementById('gameCanvas');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext('2d');

// ── Game state ────────────────────────────────────────────
let score       = 0;
let lives       = 3;
let gameState   = 'playing'; // 'playing' | 'dead' | 'victory' | 'gameover'
let invincible  = 0;         // ms of invincibility after hit
let totalBlocks = 0;         // counted after buildGrid
let destroyedBlocks = 0;

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

function soundBombPlace()    { playTone(220, 'sine', 0.12, 0.2); }
function soundBlockDestroy() { playTone(180, 'sawtooth', 0.15, 0.25); playTone(120, 'sawtooth', 0.12, 0.2, 0.08); }
function soundChain()        { playTone(440, 'square', 0.1, 0.15); playTone(330, 'square', 0.1, 0.15, 0.1); }
function soundPickup()       { playTone(523, 'sine', 0.08, 0.25); playTone(659, 'sine', 0.08, 0.25, 0.09); playTone(784, 'sine', 0.12, 0.25, 0.18); }
function soundHurt()         { playTone(150, 'sawtooth', 0.3, 0.4); playTone(100, 'sawtooth', 0.2, 0.3, 0.15); }
function soundVictory()      { [523,659,784,1047].forEach((f,i) => playTone(f,'sine',0.3,0.3,i*0.15)); }
function soundGameOver()     { [300,250,200,150].forEach((f,i) => playTone(f,'sawtooth',0.3,0.35,i*0.18)); }

function soundExplosion() {
  const bufSize = audioCtx.sampleRate * 0.35;
  const buf  = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src    = audioCtx.createBufferSource();
  src.buffer   = buf;
  const gain   = audioCtx.createGain();
  gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
  const filter = audioCtx.createBiquadFilter();
  filter.type  = 'lowpass';
  filter.frequency.value = 600;
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  src.start();
}

// ── Grid ─────────────────────────────────────────────────
const grid    = [];
const powerups = {}; // key: "r,c" → PU type (hidden under block)

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
  const puTypes  = [PU_BOMB, PU_RANGE, PU_SPEED, PU_LIFE];

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === EMPTY) {
        const safe = safeZone.some(([sr, sc]) => sr === r && sc === c);
        if (!safe && Math.random() < 0.65) {
          grid[r][c] = BLOCK;
          totalBlocks++;
          // 30 % chance of hiding a power-up inside
          if (Math.random() < 0.30) {
            powerups[`${r},${c}`] = puTypes[Math.floor(Math.random() * puTypes.length)];
          }
        }
      }
    }
  }
}

// Visible power-ups on the ground (block was destroyed, pu revealed)
// { row, col, type }
const visiblePU = [];

// ── Player ───────────────────────────────────────────────
const player = {
  row: 1, col: 1,
  x: TILE, y: TILE,
  speed: 3,
  targetX: TILE, targetY: TILE,
  moving: false,
  bombRange: 2,
  maxBombs: 1,
};

// ── Bombs / Explosions / Particles ───────────────────────
const bombs      = [];
const explosions = [];
const particles  = [];
const EXPLOSION_LIFE = 600;

function spawnParticles(cx, cy, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 1 + Math.random() * 3;
    particles.push({ x: cx, y: cy, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
                     life: 400 + Math.random()*200, maxLife: 600, color });
  }
}

// ── Input ────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

function getInput() {
  if (keys['ArrowUp']    || keys['w'] || keys['W']) return { dr:-1, dc: 0 };
  if (keys['ArrowDown']  || keys['s'] || keys['S']) return { dr: 1, dc: 0 };
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) return { dr: 0, dc:-1 };
  if (keys['ArrowRight'] || keys['d'] || keys['D']) return { dr: 0, dc: 1 };
  return null;
}

let spaceWasDown = false;
let enterWasDown = false;

// ── Collision ─────────────────────────────────────────────
function isWalkable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  if (grid[row][col] !== EMPTY) return false;
  const hasBomb = bombs.some(b => b.row === row && b.col === col);
  if (hasBomb && !(row === player.row && col === player.col)) return false;
  return true;
}

// ── Power-up application ──────────────────────────────────
const PU_COLOR = { [PU_BOMB]:'#ff6b35', [PU_RANGE]:'#e74c3c', [PU_SPEED]:'#00d2ff', [PU_LIFE]:'#2ecc71' };
const PU_ICON  = { [PU_BOMB]:'💣', [PU_RANGE]:'🔥', [PU_SPEED]:'⚡', [PU_LIFE]:'❤️' };
const PU_LABEL = { [PU_BOMB]:'+Bombe', [PU_RANGE]:'+Portée', [PU_SPEED]:'+Vitesse', [PU_LIFE]:'+Vie' };

function applyPowerup(type) {
  switch (type) {
    case PU_BOMB:  player.maxBombs  = Math.min(player.maxBombs + 1, 8); break;
    case PU_RANGE: player.bombRange = Math.min(player.bombRange + 1, 8); break;
    case PU_SPEED: player.speed     = Math.min(player.speed + 0.8, 7);  break;
    case PU_LIFE:  lives            = Math.min(lives + 1, 5);           break;
  }
  score += 50;
  soundPickup();
  // Floating score text particle
  floatingTexts.push({ x: player.x + TILE/2, y: player.y, text: PU_LABEL[type], life: 1200, color: PU_COLOR[type] });
}

// Floating score/label texts
const floatingTexts = [];

// ── Explosion logic ───────────────────────────────────────
function triggerExplosion(bomb) {
  soundExplosion();
  const { row, col, range } = bomb;
  markExplosion(row, col);

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i <= range; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
      if (grid[r][c] === WALL) break;
      if (grid[r][c] === BLOCK) {
        grid[r][c] = EMPTY;
        destroyedBlocks++;
        score += 10;
        markExplosion(r, c);
        soundBlockDestroy();
        spawnParticles(c*TILE+TILE/2, r*TILE+TILE/2, '#8b5e3c');
        floatingTexts.push({ x: c*TILE+TILE/2, y: r*TILE, text: '+10', life: 900, color: '#fff' });
        // Reveal hidden power-up
        const key = `${r},${c}`;
        if (powerups[key]) {
          visiblePU.push({ row: r, col: c, type: powerups[key] });
          delete powerups[key];
        }
        break;
      }
      markExplosion(r, c);
    }
  }

  // Chain reaction
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
  if (!explosions.some(e => e.row === row && e.col === col)) {
    explosions.push({ row, col, life: EXPLOSION_LIFE });
    spawnParticles(col*TILE+TILE/2, row*TILE+TILE/2, '#ff6600');
  }
}

// ── Victory check ─────────────────────────────────────────
function checkVictory() {
  if (destroyedBlocks >= Math.ceil(totalBlocks * 0.80)) {
    gameState = 'victory';
    soundVictory();
  }
}

// ── Player hit ────────────────────────────────────────────
function checkPlayerHit(dt) {
  if (invincible > 0) { invincible -= dt; return; }
  const inFire = explosions.some(e => e.row === player.row && e.col === player.col);
  if (!inFire) return;
  lives--;
  invincible = 2000; // 2s grace
  soundHurt();
  spawnParticles(player.x+TILE/2, player.y+TILE/2, '#ff0000', 20);
  if (lives <= 0) {
    gameState = 'gameover';
    soundGameOver();
  } else {
    gameState = 'dead';
    setTimeout(() => { gameState = 'playing'; }, 1200);
  }
}

// ── Restart ───────────────────────────────────────────────
function restart() {
  // Reset grid
  for (let r = 0; r < ROWS; r++) grid[r] = [];
  Object.keys(powerups).forEach(k => delete powerups[k]);
  visiblePU.length = 0;
  bombs.length = 0;
  explosions.length = 0;
  particles.length = 0;
  floatingTexts.length = 0;
  score = 0; lives = 3; gameState = 'playing'; invincible = 0;
  totalBlocks = 0; destroyedBlocks = 0;
  player.row=1; player.col=1; player.x=TILE; player.y=TILE;
  player.targetX=TILE; player.targetY=TILE; player.moving=false;
  player.speed=3; player.bombRange=2; player.maxBombs=1;
  buildGrid();
}

// ── Update ────────────────────────────────────────────────
let lastTime = 0;

function update(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  // Enter on end screens → restart
  const enterDown = keys['Enter'];
  if (enterDown && !enterWasDown && (gameState === 'gameover' || gameState === 'victory')) restart();
  enterWasDown = enterDown;

  if (gameState !== 'playing' && gameState !== 'dead') return;

  // ── Movement ──
  if (gameState === 'playing' && !player.moving) {
    const dir = getInput();
    if (dir) {
      const nr = player.row + dir.dr;
      const nc = player.col + dir.dc;
      if (isWalkable(nr, nc)) {
        player.row = nr; player.col = nc;
        player.targetX = nc * TILE; player.targetY = nr * TILE;
        player.moving = true;
      }
    }
  }

  if (player.moving) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist <= player.speed) {
      player.x = player.targetX; player.y = player.targetY;
      player.moving = false;
    } else {
      player.x += (dx/dist) * player.speed;
      player.y += (dy/dist) * player.speed;
    }
  }

  // ── Collect power-ups ──
  for (let i = visiblePU.length - 1; i >= 0; i--) {
    const pu = visiblePU[i];
    if (pu.row === player.row && pu.col === player.col) {
      applyPowerup(pu.type);
      visiblePU.splice(i, 1);
    }
  }

  // ── Place bomb ──
  const spaceDown = keys[' '];
  if (spaceDown && !spaceWasDown && gameState === 'playing') {
    const alreadyHere = bombs.some(b => b.row === player.row && b.col === player.col);
    if (bombs.length < player.maxBombs && !alreadyHere) {
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
    p.x += p.vx; p.y += p.vy; p.vy += 0.08;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── Floating texts ──
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y -= 0.5;
    floatingTexts[i].life -= dt;
    if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
  }

  checkPlayerHit(dt);
  checkVictory();
}

// ── Draw ──────────────────────────────────────────────────
function drawGrid() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = grid[r][c];
      ctx.fillStyle = type === WALL ? '#555566' : type === BLOCK ? '#8b5e3c' : '#2d4a22';
      ctx.fillRect(c*TILE, r*TILE, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(c*TILE, r*TILE, TILE, TILE);
      if (type === BLOCK) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(c*TILE+4, r*TILE+4, TILE-8, TILE-8);
      }
    }
  }
}

function drawPowerups() {
  for (const pu of visiblePU) {
    const x = pu.col * TILE, y = pu.row * TILE;
    // Glowing background
    ctx.fillStyle = PU_COLOR[pu.type];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(x+6, y+6, TILE-12, TILE-12, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Icon
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PU_ICON[pu.type], x + TILE/2, y + TILE/2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const alpha = Math.min(1, e.life / (EXPLOSION_LIFE * 0.4));
    const grad = ctx.createRadialGradient(
      e.col*TILE+TILE/2, e.row*TILE+TILE/2, 2,
      e.col*TILE+TILE/2, e.row*TILE+TILE/2, TILE/2
    );
    grad.addColorStop(0, `rgba(255,255,100,${alpha})`);
    grad.addColorStop(0.5, `rgba(255,100,0,${alpha*0.85})`);
    grad.addColorStop(1, `rgba(255,50,0,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(e.col*TILE, e.row*TILE, TILE, TILE);
  }
}

function drawBombs() {
  for (const b of bombs) {
    const cx = b.col*TILE+TILE/2, cy = b.row*TILE+TILE/2;
    const frac   = Math.max(0, b.timer/3000);
    const pulse  = 1 + 0.12*Math.sin(Date.now()/80);
    const radius = (TILE/2-6)*pulse;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.fill();
    const fuseG = Math.round(frac*200);
    ctx.strokeStyle = `rgb(255,${fuseG},0)`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = `rgb(255,${fuseG},0)`;
    ctx.beginPath(); ctx.arc(cx-radius*0.5, cy-radius*0.8, 3, 0, Math.PI*2); ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life/p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x-2, p.y-2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  // Flash when invincible
  if (invincible > 0 && Math.floor(invincible / 150) % 2 === 0) return;
  const pad = 5;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.roundRect(player.x+pad, player.y+pad, TILE-pad*2, TILE-pad*2, 8);
  ctx.fill();
  ctx.strokeStyle = '#c07800'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(player.x+15, player.y+17, 3, 0, Math.PI*2);
  ctx.arc(player.x+33, player.y+17, 3, 0, Math.PI*2);
  ctx.fill();
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    const alpha = Math.max(0, ft.life / 1200);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // Lives
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(4, 4, canvas.width - 8, 32);
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#e74c3c';
  const heartsStr = '❤️'.repeat(lives) + '🖤'.repeat(Math.max(0, 3 - lives));
  ctx.fillText(heartsStr, 10, 24);
  // Score
  ctx.fillStyle = '#f5a623';
  ctx.textAlign = 'center';
  ctx.fillText(`Score: ${score}`, canvas.width/2, 24);
  // Bombs / range
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'right';
  ctx.fillText(`💣${player.maxBombs - bombs.length}/${player.maxBombs}  🔥${player.bombRange}  ⚡${player.speed.toFixed(1)}`, canvas.width - 10, 24);
  ctx.textAlign = 'left';
  // Progress bar
  const pct = Math.min(1, destroyedBlocks / Math.ceil(totalBlocks * 0.80));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(4, canvas.height - 14, canvas.width - 8, 10);
  ctx.fillStyle = pct >= 1 ? '#2ecc71' : '#f5a623';
  ctx.fillRect(4, canvas.height - 14, (canvas.width - 8) * pct, 10);
  ctx.fillStyle = '#fff';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Détruits: ${destroyedBlocks}/${Math.ceil(totalBlocks*0.80)} pour gagner`, canvas.width/2, canvas.height - 5);
  ctx.textAlign = 'left';
}

function drawOverlay(title, subtitle, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 52px Arial';
  ctx.fillText(title, canvas.width/2, canvas.height/2 - 30);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText(subtitle, canvas.width/2, canvas.height/2 + 20);
  ctx.fillStyle = '#aaa';
  ctx.font = '14px Arial';
  ctx.fillText('Appuie sur Entrée pour rejouer', canvas.width/2, canvas.height/2 + 55);
  ctx.textAlign = 'left';
}

// ── Loop ──────────────────────────────────────────────────
function loop(ts) {
  update(ts);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPowerups();
  drawExplosions();
  drawBombs();
  drawParticles();
  drawPlayer();
  drawFloatingTexts();
  drawHUD();

  if (gameState === 'victory')
    drawOverlay('VICTOIRE !', `Score final : ${score}`, '#2ecc71');
  else if (gameState === 'gameover')
    drawOverlay('GAME OVER', `Score : ${score}`, '#e74c3c');

  requestAnimationFrame(loop);
}

buildGrid();
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
