// ═══════════════════════════════════════════════════════════
//  JAMES BOMB 2  —  Étapes 1-4 complètes
// ═══════════════════════════════════════════════════════════
const TILE = 48;
const COLS = 15;
const ROWS = 13;

const EMPTY = 0;
const WALL  = 1;
const BLOCK = 2;

const PU_BOMB  = 'bomb';
const PU_RANGE = 'range';
const PU_SPEED = 'speed';
const PU_LIFE  = 'life';

const PU_COLOR = { [PU_BOMB]:'#ff6b35', [PU_RANGE]:'#e74c3c', [PU_SPEED]:'#00d2ff', [PU_LIFE]:'#2ecc71' };
const PU_ICON  = { [PU_BOMB]:'💣', [PU_RANGE]:'🔥', [PU_SPEED]:'⚡', [PU_LIFE]:'❤️' };
const PU_LABEL = { [PU_BOMB]:'+Bombe', [PU_RANGE]:'+Portée', [PU_SPEED]:'+Vitesse', [PU_LIFE]:'+Vie' };

// ── Canvas ───────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext('2d');

// ── Game state ───────────────────────────────────────────
// 'menu' | 'playing' | 'dead' | 'victory' | 'gameover'
let gameState  = 'menu';
let playerCount = 1;   // 1 or 2
let score      = 0;
let score2     = 0;
let lives      = 3;
let lives2     = 3;
let invincible  = 0;
let invincible2 = 0;
let totalBlocks     = 0;
let destroyedBlocks = 0;
let menuCursor = 0;    // 0=1P  1=2P

// ── Web Audio ────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, dur, vol = 0.3, delay = 0) {
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.connect(g); g.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
  g.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + dur);
  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime  + delay + dur);
}

function soundMenu()   { playTone(440,'sine',0.06,0.15); }
function soundStart()  { [523,659,784].forEach((f,i)=>playTone(f,'sine',0.15,0.25,i*0.1)); }
function soundBomb()   { playTone(220,'sine',0.12,0.2); }
function soundBlock()  { playTone(180,'sawtooth',0.15,0.25); playTone(120,'sawtooth',0.12,0.2,0.08); }
function soundChain()  { playTone(440,'square',0.1,0.15); playTone(330,'square',0.1,0.15,0.1); }
function soundPickup() { [523,659,784].forEach((f,i)=>playTone(f,'sine',0.08,0.25,i*0.09)); }
function soundHurt()   { playTone(150,'sawtooth',0.3,0.4); playTone(100,'sawtooth',0.2,0.3,0.15); }
function soundVictory(){ [523,659,784,1047].forEach((f,i)=>playTone(f,'sine',0.3,0.3,i*0.15)); }
function soundGameOver(){ [300,250,200,150].forEach((f,i)=>playTone(f,'sawtooth',0.3,0.35,i*0.18)); }

function soundExplosion() {
  const n = audioCtx.sampleRate * 0.35;
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random()*2-1;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g   = audioCtx.createGain();
  g.gain.setValueAtTime(0.6, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
  const f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=600;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
}

// ── Grid ─────────────────────────────────────────────────
const grid    = [];
const powerups = {};

function buildGrid() {
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r===0||r===ROWS-1||c===0||c===COLS-1) { grid[r][c]=WALL; }
      else if (r%2===0&&c%2===0)                { grid[r][c]=WALL; }
      else                                       { grid[r][c]=EMPTY; }
    }
  }
  const safe = [[1,1],[1,2],[2,1],[ROWS-2,COLS-2],[ROWS-2,COLS-3],[ROWS-3,COLS-2]];
  const puTypes = [PU_BOMB,PU_RANGE,PU_SPEED,PU_LIFE];
  for (let r=1;r<ROWS-1;r++) for (let c=1;c<COLS-1;c++) {
    if (grid[r][c]===EMPTY) {
      const isSafe = safe.some(([sr,sc])=>sr===r&&sc===c);
      if (!isSafe && Math.random()<0.65) {
        grid[r][c] = BLOCK; totalBlocks++;
        if (Math.random()<0.30) powerups[`${r},${c}`] = puTypes[Math.floor(Math.random()*4)];
      }
    }
  }
}

const visiblePU = [];

// ── Players ───────────────────────────────────────────────
// Pixel-perfect sub-tile movement with wall sliding
function makePlayer(row, col, color, borderColor) {
  return {
    row, col,
    px: col*TILE, py: row*TILE,   // pixel position (top-left of tile)
    vx: 0, vy: 0,                 // pixel velocity
    speed: 2,
    bombRange: 1, maxBombs: 1,
    color, borderColor,
    alive: true,
  };
}

let p1, p2;

// ── Bombs / Explosions / Particles ────────────────────────
const bombs      = [];
const explosions = [];
const particles  = [];
const floatingTexts = [];
const EXPLOSION_LIFE = 600;

function spawnParticles(cx, cy, color, n=10) {
  for (let i=0;i<n;i++) {
    const a=Math.random()*Math.PI*2, s=1+Math.random()*3;
    particles.push({x:cx,y:cy,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:400+Math.random()*200,maxLife:600,color});
  }
}

// ── Input ─────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  // Prevent browser scroll / default on all game keys
  const blocked = [
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter','Shift',
    'z','Z','q','Q','s','S','d','D',
  ];
  if (blocked.includes(e.key)) e.preventDefault();
  keys[e.key] = true;
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

let prevKeys = {};
function justPressed(k) { return keys[k] && !prevKeys[k]; }

// ── Input directions (STRICTLY separated) ────────────────
// P1 : Arrow keys ONLY
function getDir1() {
  if (keys['ArrowUp'])    return {dx: 0, dy:-1};
  if (keys['ArrowDown'])  return {dx: 0, dy: 1};
  if (keys['ArrowLeft'])  return {dx:-1, dy: 0};
  if (keys['ArrowRight']) return {dx: 1, dy: 0};
  return null;
}

// P2 : Z-Q-S-D (AZERTY layout — e.key reflects the character, not the position)
//   Z → Haut   Q → Gauche   S → Bas   D → Droite
function getDir2() {
  if (keys['z'] || keys['Z']) return {dx: 0, dy:-1};
  if (keys['s'] || keys['S']) return {dx: 0, dy: 1};
  if (keys['q'] || keys['Q']) return {dx:-1, dy: 0};
  if (keys['d'] || keys['D']) return {dx: 1, dy: 0};
  return null;
}

// ── Collision constants ───────────────────────────────────
// MARGIN=10 → hitbox = 28×28 px inside each 48×48 tile.
// An offset ≤ 10 px never causes the hitbox to cross into the adjacent tile,
// so those cases slide freely. CORNER_CUT handles offsets up to ~22 px.
const MARGIN     = 10;
const CORNER_CUT = 22;   // px: auto-align threshold when blocked (generous magnet)
const ALIGN_SPEED = 4;   // px/frame: magnet pull toward corridor centre (independent of player speed)

function tileAt(px, py) {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (r<0||r>=ROWS||c<0||c>=COLS) return WALL;
  return grid[r][c];
}

// Returns true if the hitbox at (px,py) overlaps any solid tile.
function isSolidPixel(px, py) {
  const lo = MARGIN, hi = TILE - 1 - MARGIN;
  return [[lo,lo],[hi,lo],[lo,hi],[hi,hi]].some(([dx,dy]) => {
    const t = tileAt(px+dx, py+dy);
    return t===WALL || t===BLOCK;
  });
}

// Returns true if the hitbox at (px,py) overlaps a bomb the player didn't place.
function bombBlockAt(px, py, playerBombs) {
  const lo = MARGIN, hi = TILE - 1 - MARGIN;
  for (const [dx,dy] of [[lo,lo],[hi,lo],[lo,hi],[hi,hi]]) {
    const c = Math.floor((px+dx)/TILE), r = Math.floor((py+dy)/TILE);
    const b = bombs.find(b => b.row===r && b.col===c);
    if (b && !playerBombs.has(b)) return true;
  }
  return false;
}

// ── AABB corner-cutting movement ──────────────────────────
// When the player is blocked in their travel direction but is ≤ CORNER_CUT px
// from the centre of an adjacent corridor, we nudge them orthogonally so they
// glide into the opening — the classic Bomberman feel.
function movePlayer(p, dir, playerBombs) {
  if (!p.alive || !dir) return;

  const spd = p.speed;

  if (dir.dy !== 0) {
    // ── Vertical ──
    const ny = p.py + dir.dy * spd;
    if (!isSolidPixel(p.px, ny) && !bombBlockAt(p.px, ny, playerBombs)) {
      p.py = ny;
      _alignAxis('px', p);   // magnet toward column centre
    } else {
      // Corner-cut: nudge X toward nearest column centre, then retry
      if (_cornerCutAxis('px', p)) {
        const ny2 = p.py + dir.dy * spd;
        if (!isSolidPixel(p.px, ny2) && !bombBlockAt(p.px, ny2, playerBombs))
          p.py = ny2;
      }
    }

  } else {
    // ── Horizontal ──
    const nx = p.px + dir.dx * spd;
    if (!isSolidPixel(nx, p.py) && !bombBlockAt(nx, p.py, playerBombs)) {
      p.px = nx;
      _alignAxis('py', p);   // magnet toward row centre
    } else {
      // Corner-cut: nudge Y toward nearest row centre, then retry
      if (_cornerCutAxis('py', p)) {
        const nx2 = p.px + dir.dx * spd;
        if (!isSolidPixel(nx2, p.py) && !bombBlockAt(nx2, p.py, playerBombs))
          p.px = nx2;
      }
    }
  }

  p.row = Math.floor((p.py + TILE/2) / TILE);
  p.col = Math.floor((p.px + TILE/2) / TILE);
}

// Pull the orthogonal axis toward its nearest tile centre while the player moves.
// Uses ALIGN_SPEED (faster than walk speed) for a strong magnet feel.
function _alignAxis(axis, p) {
  const snap = Math.round(p[axis] / TILE) * TILE;
  const diff = snap - p[axis];
  if (diff === 0) return;
  const nudge  = Math.sign(diff) * Math.min(Math.abs(diff), ALIGN_SPEED);
  const testPx = axis==='px' ? p.px+nudge : p.px;
  const testPy = axis==='py' ? p.py+nudge : p.py;
  if (!isSolidPixel(testPx, testPy)) p[axis] += nudge;
}

// Corner-cut on `axis` (orthogonal to travel direction) when the player is blocked.
// Snaps the player fully to the nearest corridor centre in one frame (magnet).
// Only triggers if misalignment ≤ CORNER_CUT and the snapped position is free.
function _cornerCutAxis(axis, p) {
  const snap = Math.round(p[axis] / TILE) * TILE;
  const diff = snap - p[axis];
  if (diff === 0 || Math.abs(diff) > CORNER_CUT) return false;
  // Verify the snap destination is not itself solid before committing
  const chkPx = axis==='px' ? snap : p.px;
  const chkPy = axis==='py' ? snap : p.py;
  if (isSolidPixel(chkPx, chkPy)) return false;
  p[axis] = snap;   // instant full correction — classic Bomberman magnet
  return true;
}

// ── Explosion logic ───────────────────────────────────────
function triggerExplosion(bomb) {
  soundExplosion();
  const {row,col,range} = bomb;
  markExplosion(row,col);
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    for (let i=1;i<=range;i++) {
      const r=row+dr*i, c=col+dc*i;
      if (r<0||r>=ROWS||c<0||c>=COLS) break;
      if (grid[r][c]===WALL) break;
      if (grid[r][c]===BLOCK) {
        grid[r][c]=EMPTY; destroyedBlocks++; markExplosion(r,c); soundBlock();
        spawnParticles(c*TILE+TILE/2, r*TILE+TILE/2,'#8b5e3c');
        addScore(bomb.owner, 10);
        floatingTexts.push({x:c*TILE+TILE/2,y:r*TILE,text:'+10',life:900,color:'#fff'});
        const key=`${r},${c}`;
        if (powerups[key]) { visiblePU.push({row:r,col:c,type:powerups[key]}); delete powerups[key]; }
        break;
      }
      markExplosion(r,c);
    }
  }
  for (let i=bombs.length-1;i>=0;i--) {
    const b=bombs[i]; if (b===bomb) continue;
    if (explosions.some(e=>e.row===b.row&&e.col===b.col)) {
      bombs.splice(i,1); soundChain(); triggerExplosion(b);
    }
  }
}

function markExplosion(row,col) {
  if (!explosions.some(e=>e.row===row&&e.col===col)) {
    explosions.push({row,col,life:EXPLOSION_LIFE});
    spawnParticles(col*TILE+TILE/2, row*TILE+TILE/2,'#ff6600');
  }
}

function addScore(owner, pts) {
  if (owner===2) score2+=pts; else score+=pts;
}

// ── Power-up application ──────────────────────────────────
function applyPU(p, type, owner) {
  switch(type) {
    case PU_BOMB:  p.maxBombs  = Math.min(p.maxBombs+1, 8); break;
    case PU_RANGE: p.bombRange = Math.min(p.bombRange+1, 8); break;
    case PU_SPEED: p.speed     = Math.min(p.speed+0.8, 7);  break;
    case PU_LIFE:
      if (owner===1) lives  = Math.min(lives+1, 5);
      else           lives2 = Math.min(lives2+1, 5);
      break;
  }
  addScore(owner, 50);
  soundPickup();
  floatingTexts.push({x:p.px+TILE/2, y:p.py, text:PU_LABEL[type], life:1200, color:PU_COLOR[type]});
}

// ── Hit detection ─────────────────────────────────────────
function checkHit(p, owner, inv, setInv) {
  if (!p.alive) return inv;
  if (inv>0) return inv;
  const r=p.row, c=p.col;
  if (!explosions.some(e=>e.row===r&&e.col===c)) return inv;
  soundHurt();
  spawnParticles(p.px+TILE/2, p.py+TILE/2,'#ff0000',20);
  if (owner===1) { lives--;  if(lives<=0)  { p.alive=false; } }
  else           { lives2--; if(lives2<=0) { p.alive=false; } }
  return 2000;
}

// ── Restart / init ────────────────────────────────────────
// Tracks which bombs each player "owns" so they can walk over their own
const p1Bombs = new Set();
const p2Bombs = new Set();

function startGame() {
  for (let r=0;r<ROWS;r++) grid[r]=[];
  Object.keys(powerups).forEach(k=>delete powerups[k]);
  visiblePU.length=0; bombs.length=0; explosions.length=0;
  particles.length=0; floatingTexts.length=0;
  p1Bombs.clear(); p2Bombs.clear();
  score=0; score2=0; lives=3; lives2=3;
  invincible=0; invincible2=0;
  totalBlocks=0; destroyedBlocks=0;
  p1=makePlayer(1,1,'#f5a623','#c07800');
  p2=makePlayer(ROWS-2,COLS-2,'#3498db','#1a6ea8');
  buildGrid();
  gameState='playing';
  soundStart();
}

// ── Update ────────────────────────────────────────────────
let lastTime=0;

function update(ts) {
  const dt = Math.min(ts-lastTime, 50); // cap at 50ms to avoid huge jumps
  lastTime = ts;

  // ── Menu ──
  if (gameState==='menu') {
    if (justPressed('ArrowUp')  || justPressed('ArrowDown')) { menuCursor=(menuCursor+1)%2; soundMenu(); }
    if (justPressed('Enter') || justPressed(' ')) { playerCount=menuCursor+1; startGame(); }
    prevKeys={...keys}; return;
  }

  // ── End screens ──
  if (gameState==='gameover'||gameState==='victory') {
    if (justPressed('Enter')||justPressed(' ')) gameState='menu';
    prevKeys={...keys}; return;
  }

  // ── Playing ──

  // Movement P1
  const dir1 = getDir1();
  movePlayer(p1, p1.alive?dir1:null, p1Bombs);

  // Movement P2
  if (playerCount===2) {
    const dir2 = getDir2();
    movePlayer(p2, p2.alive?dir2:null, p2Bombs);
  }

  // Collect power-ups
  [p1,p2].forEach((p,i)=>{
    if (!p.alive) return;
    const owner=i+1;
    for (let j=visiblePU.length-1;j>=0;j--) {
      const pu=visiblePU[j];
      if (pu.row===p.row&&pu.col===p.col) { applyPU(p,pu.type,owner); visiblePU.splice(j,1); }
    }
  });

  // Place bombs P1
  if (p1.alive && justPressed(' ')) {
    const already=bombs.some(b=>b.row===p1.row&&b.col===p1.col);
    const ownCount=[...p1Bombs].filter(b=>bombs.includes(b)).length;
    if (!already && ownCount<p1.maxBombs) {
      const b={row:p1.row,col:p1.col,timer:3000,range:p1.bombRange,owner:1};
      bombs.push(b); p1Bombs.add(b); soundBomb();
    }
  }

  // Place bombs P2 — Shift (Maj)
  if (playerCount===2 && p2.alive && justPressed('Shift')) {
    const already=bombs.some(b=>b.row===p2.row&&b.col===p2.col);
    const ownCount=[...p2Bombs].filter(b=>bombs.includes(b)).length;
    if (!already && ownCount<p2.maxBombs) {
      const b={row:p2.row,col:p2.col,timer:3000,range:p2.bombRange,owner:2};
      bombs.push(b); p2Bombs.add(b); soundBomb();
    }
  }

  // Bomb timers
  for (let i=bombs.length-1;i>=0;i--) {
    bombs[i].timer-=dt;
    if (bombs[i].timer<=0) {
      const b=bombs.splice(i,1)[0];
      p1Bombs.delete(b); p2Bombs.delete(b);
      triggerExplosion(b);
    }
  }

  // Explosion lifetime
  for (let i=explosions.length-1;i>=0;i--) {
    explosions[i].life-=dt;
    if (explosions[i].life<=0) explosions.splice(i,1);
  }

  // Particles
  for (let i=particles.length-1;i>=0;i--) {
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life-=dt;
    if (p.life<=0) particles.splice(i,1);
  }

  // Floating texts
  for (let i=floatingTexts.length-1;i>=0;i--) {
    floatingTexts[i].y-=0.5; floatingTexts[i].life-=dt;
    if (floatingTexts[i].life<=0) floatingTexts.splice(i,1);
  }

  // Hit detection
  invincible-=dt;
  invincible=checkHit(p1,1,invincible,v=>invincible=v);
  if (playerCount===2) {
    invincible2-=dt;
    invincible2=checkHit(p2,2,invincible2,v=>invincible2=v);
  }

  // Victory / game over
  const target=Math.ceil(totalBlocks*0.80);
  if (destroyedBlocks>=target) { gameState='victory'; soundVictory(); }
  else if (playerCount===1 && !p1.alive) { gameState='gameover'; soundGameOver(); }
  else if (playerCount===2 && !p1.alive && !p2.alive) { gameState='gameover'; soundGameOver(); }
  else if (playerCount===2 && !p1.alive) { gameState='victory'; soundVictory(); } // P2 wins
  else if (playerCount===2 && !p2.alive) { gameState='victory'; soundVictory(); } // P1 wins

  prevKeys={...keys};
}

// ── Draw helpers ──────────────────────────────────────────
function roundRect(x,y,w,h,r) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}

// ── Draw grid ─────────────────────────────────────────────
function drawGrid() {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const t=grid[r][c];
    // Base fill
    if (t===WALL) {
      // Retro brick pattern
      ctx.fillStyle='#44445a';
      ctx.fillRect(c*TILE,r*TILE,TILE,TILE);
      ctx.fillStyle='#3a3a50';
      ctx.fillRect(c*TILE+2,r*TILE+2,TILE-4,TILE-4);
      ctx.fillStyle='#55556a';
      ctx.fillRect(c*TILE+4,r*TILE+4,TILE-8,10);
    } else if (t===BLOCK) {
      ctx.fillStyle='#7a4f2e';
      ctx.fillRect(c*TILE,r*TILE,TILE,TILE);
      ctx.fillStyle='#9b6640';
      ctx.fillRect(c*TILE+3,r*TILE+3,TILE-6,TILE-6);
      ctx.fillStyle='rgba(255,255,255,0.07)';
      ctx.fillRect(c*TILE+6,r*TILE+6,TILE-12,TILE-12);
    } else {
      // Checker-like grass pattern
      ctx.fillStyle=(r+c)%2===0?'#2a4520':'#263f1e';
      ctx.fillRect(c*TILE,r*TILE,TILE,TILE);
    }
    // Grid line
    ctx.strokeStyle='rgba(0,0,0,0.18)';
    ctx.strokeRect(c*TILE,r*TILE,TILE,TILE);
  }
}

function drawPowerups() {
  for (const pu of visiblePU) {
    const x=pu.col*TILE, y=pu.row*TILE;
    // Animated glow pulse
    const glow=0.7+0.3*Math.sin(Date.now()/300);
    ctx.globalAlpha=glow;
    ctx.fillStyle=PU_COLOR[pu.type];
    ctx.beginPath(); ctx.roundRect(x+6,y+6,TILE-12,TILE-12,6); ctx.fill();
    ctx.globalAlpha=1;
    ctx.font='22px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(PU_ICON[pu.type],x+TILE/2,y+TILE/2);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const a=Math.min(1,e.life/(EXPLOSION_LIFE*0.4));
    const g=ctx.createRadialGradient(e.col*TILE+TILE/2,e.row*TILE+TILE/2,2,e.col*TILE+TILE/2,e.row*TILE+TILE/2,TILE/2);
    g.addColorStop(0,`rgba(255,255,100,${a})`);
    g.addColorStop(0.5,`rgba(255,100,0,${a*0.85})`);
    g.addColorStop(1,`rgba(255,50,0,0)`);
    ctx.fillStyle=g; ctx.fillRect(e.col*TILE,e.row*TILE,TILE,TILE);
  }
}

function drawBombs() {
  for (const b of bombs) {
    const cx=b.col*TILE+TILE/2, cy=b.row*TILE+TILE/2;
    const frac=Math.max(0,b.timer/3000);
    const pulse=1+0.12*Math.sin(Date.now()/80);
    const rad=(TILE/2-6)*pulse;
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx,cy+rad*0.8,rad*0.7,rad*0.25,0,0,Math.PI*2); ctx.fill();
    // Body
    const bg=ctx.createRadialGradient(cx-rad*0.3,cy-rad*0.3,1,cx,cy,rad);
    bg.addColorStop(0,'#444'); bg.addColorStop(1,'#111');
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.fill();
    // Fuse ring
    const fuseG=Math.round(frac*200);
    ctx.strokeStyle=`rgb(255,${fuseG},0)`; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=`rgb(255,${fuseG},0)`;
    ctx.beginPath(); ctx.arc(cx-rad*0.5,cy-rad*0.8,3,0,Math.PI*2); ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha=Math.max(0,p.life/p.maxLife);
    ctx.fillStyle=p.color; ctx.fillRect(p.x-2,p.y-2,4,4);
  }
  ctx.globalAlpha=1;
}

function drawAPlayer(p, inv) {
  if (!p.alive) return;
  if (inv>0 && Math.floor(inv/150)%2===0) return;
  const pad=4;
  const bg=ctx.createRadialGradient(p.px+TILE*0.4,p.py+TILE*0.35,2,p.px+TILE/2,p.py+TILE/2,TILE*0.5);
  bg.addColorStop(0,p.color); bg.addColorStop(1,p.borderColor);
  ctx.fillStyle=bg;
  ctx.beginPath(); ctx.roundRect(p.px+pad,p.py+pad,TILE-pad*2,TILE-pad*2,10); ctx.fill();
  ctx.strokeStyle=p.borderColor; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(p.px+pad,p.py+pad,TILE-pad*2,TILE-pad*2,10); ctx.stroke();
  // Eyes
  ctx.fillStyle='#1a1a2e';
  ctx.beginPath();
  ctx.arc(p.px+14,p.py+17,3,0,Math.PI*2);
  ctx.arc(p.px+34,p.py+17,3,0,Math.PI*2);
  ctx.fill();
  // White glint
  ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.ellipse(p.px+TILE*0.35,p.py+TILE*0.28,5,3,Math.PI*-0.3,0,Math.PI*2); ctx.fill();
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    ctx.globalAlpha=Math.max(0,ft.life/1200);
    ctx.fillStyle=ft.color; ctx.font='bold 14px "Courier New"';
    ctx.textAlign='center'; ctx.fillText(ft.text,ft.x,ft.y);
    ctx.textAlign='left';
  }
  ctx.globalAlpha=1;
}

function drawHUD() {
  // Top bar background
  ctx.fillStyle='rgba(10,10,20,0.82)';
  ctx.fillRect(0,0,canvas.width,36);

  ctx.font='bold 13px "Courier New"';

  // P1 lives + score
  ctx.fillStyle='#e74c3c';
  ctx.fillText('❤️'.repeat(lives)+'🖤'.repeat(Math.max(0,3-lives)),8,24);
  ctx.fillStyle='#f5a623';
  ctx.textAlign='center';
  ctx.fillText(`P1: ${score}`,playerCount===2?canvas.width*0.3:canvas.width/2,24);

  if (playerCount===2) {
    ctx.fillStyle='#3498db';
    ctx.textAlign='center';
    ctx.fillText(`P2: ${score2}`,canvas.width*0.7,24);
    ctx.fillStyle='#e74c3c';
    ctx.textAlign='right';
    ctx.fillText('❤️'.repeat(lives2)+'🖤'.repeat(Math.max(0,3-lives2)),canvas.width-8,24);
  } else {
    ctx.fillStyle='#aaa';
    ctx.textAlign='right';
    ctx.fillText(`💣${p1.maxBombs} 🔥${p1.bombRange} ⚡${p1.speed.toFixed(1)}`,canvas.width-8,24);
  }
  ctx.textAlign='left';

  // Progress bar (bottom)
  const pct=Math.min(1,destroyedBlocks/Math.ceil(totalBlocks*0.80));
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,canvas.height-12,canvas.width,12);
  ctx.fillStyle=pct>=1?'#2ecc71':'#f5a623';
  ctx.fillRect(0,canvas.height-12,canvas.width*pct,12);
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='8px "Courier New"';
  ctx.textAlign='center';
  ctx.fillText(`${destroyedBlocks}/${Math.ceil(totalBlocks*0.80)} blocs pour victoire`,canvas.width/2,canvas.height-2);
  ctx.textAlign='left';
}

// ── Menu screen ───────────────────────────────────────────
function drawMenu() {
  // Scanline retro background
  const t=Date.now();
  ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let y=0;y<canvas.height;y+=4) {
    ctx.fillStyle='rgba(255,255,255,0.02)'; ctx.fillRect(0,y,canvas.width,2);
  }

  // Title glow
  const glow=0.6+0.4*Math.sin(t/500);
  ctx.shadowColor='#f5a623'; ctx.shadowBlur=20*glow;
  ctx.font='bold 56px "Courier New"';
  ctx.fillStyle='#f5a623'; ctx.textAlign='center';
  ctx.fillText('JAMES',canvas.width/2,canvas.height/2-80);
  ctx.fillText('BOMB 2',canvas.width/2,canvas.height/2-20);
  ctx.shadowBlur=0;

  // Subtitle
  ctx.font='12px "Courier New"'; ctx.fillStyle='#888';
  ctx.fillText('── RETRO EDITION ──',canvas.width/2,canvas.height/2+12);

  // Menu items
  const items=['1 JOUEUR','2 JOUEURS'];
  items.forEach((item,i) => {
    const y=canvas.height/2+60+i*44;
    const sel=(menuCursor===i);
    if (sel) {
      ctx.fillStyle='rgba(245,166,35,0.15)';
      ctx.fillRect(canvas.width/2-110,y-24,220,34);
      ctx.strokeStyle='#f5a623'; ctx.lineWidth=1;
      ctx.strokeRect(canvas.width/2-110,y-24,220,34);
    }
    ctx.font=`bold ${sel?18:15}px "Courier New"`;
    ctx.fillStyle=sel?'#f5a623':'#555';
    ctx.fillText(`${sel?'▶ ':' '}${item}`,canvas.width/2-(sel?90:80),y);
  });

  // Controls hint
  ctx.font='10px "Courier New"'; ctx.fillStyle='#444';
  ctx.fillText('↑↓ SÉLECTIONNER   ENTRÉE DÉMARRER',canvas.width/2,canvas.height-28);
  ctx.fillText('P1: FLÈCHES + ESPACE   P2: ZQSD (AZERTY) + MAJ',canvas.width/2,canvas.height-14);
  ctx.textAlign='left';
}

// ── End screen ────────────────────────────────────────────
function drawEndScreen(title, sub, color) {
  ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.shadowColor=color; ctx.shadowBlur=24;
  ctx.font='bold 54px "Courier New"'; ctx.fillStyle=color; ctx.textAlign='center';
  ctx.fillText(title,canvas.width/2,canvas.height/2-30);
  ctx.shadowBlur=0;
  ctx.font='18px "Courier New"'; ctx.fillStyle='#fff';
  ctx.fillText(sub,canvas.width/2,canvas.height/2+18);
  ctx.font='12px "Courier New"'; ctx.fillStyle='#888';
  ctx.fillText('ENTRÉE ou ESPACE → MENU',canvas.width/2,canvas.height/2+52);
  ctx.textAlign='left';
}

// ── Main loop ─────────────────────────────────────────────
function loop(ts) {
  update(ts);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if (gameState==='menu') {
    drawMenu();
  } else {
    drawGrid();
    drawPowerups();
    drawExplosions();
    drawBombs();
    drawParticles();
    drawAPlayer(p1, invincible);
    if (playerCount===2) drawAPlayer(p2, invincible2);
    drawFloatingTexts();
    drawHUD();

    if (gameState==='victory') {
      const sub=playerCount===2
        ? (!p1.alive?`P2 GAGNE !  Scores: P1 ${score} / P2 ${score2}`:`P1 GAGNE !  Scores: P1 ${score} / P2 ${score2}`)
        : `Score final : ${score}`;
      drawEndScreen('VICTOIRE !', sub,'#2ecc71');
    }
    if (gameState==='gameover')
      drawEndScreen('GAME OVER',`Score : ${score}`,'#e74c3c');
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => { lastTime=ts; requestAnimationFrame(loop); });
