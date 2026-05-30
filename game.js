const TILE = 48;
const COLS = 15;
const ROWS = 13;

// Tile types
const EMPTY = 0;
const WALL  = 1;  // indestructible
const BLOCK = 2;  // destructible

const canvas = document.getElementById('gameCanvas');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext('2d');

// ── Colours ──────────────────────────────────────────────
const COLOR = {
  [EMPTY]: '#2d4a22',
  [WALL]:  '#555566',
  [BLOCK]: '#8b5e3c',
  player:  '#f5a623',
  playerBorder: '#c07800',
};

// ── Grid ─────────────────────────────────────────────────
const grid = [];

function buildGrid() {
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      // Border and alternating pillars are indestructible walls
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        grid[r][c] = WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        grid[r][c] = WALL;
      } else {
        grid[r][c] = EMPTY;
      }
    }
  }

  // Spawn zone — keep the 3 tiles around player (top-left inner) clear
  const safeZone = [[1,1],[1,2],[2,1]];

  // Fill remaining empty tiles randomly with destructible blocks (~65 %)
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === EMPTY) {
        const safe = safeZone.some(([sr, sc]) => sr === r && sc === c);
        if (!safe && Math.random() < 0.65) {
          grid[r][c] = BLOCK;
        }
      }
    }
  }
}

// ── Player ───────────────────────────────────────────────
const player = {
  row: 1,
  col: 1,
  // pixel position for smooth movement
  x: TILE,
  y: TILE,
  speed: 3,          // px per frame
  targetX: TILE,
  targetY: TILE,
  moving: false,
};

// ── Input ────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup',   e => { keys[e.key] = false; });

function getInput() {
  if (keys['ArrowUp']    || keys['w'] || keys['W']) return { dr: -1, dc:  0 };
  if (keys['ArrowDown']  || keys['s'] || keys['S']) return { dr:  1, dc:  0 };
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) return { dr:  0, dc: -1 };
  if (keys['ArrowRight'] || keys['d'] || keys['D']) return { dr:  0, dc:  1 };
  return null;
}

// ── Collision ─────────────────────────────────────────────
function isWalkable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return grid[row][col] === EMPTY;
}

// ── Update ────────────────────────────────────────────────
function update() {
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

  // Smooth interpolation toward target cell
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
}

// ── Draw ──────────────────────────────────────────────────
function drawGrid() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = grid[r][c];
      ctx.fillStyle = COLOR[type];
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

      // Grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);

      // Destructible block detail
      if (type === BLOCK) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
      }
    }
  }
}

function drawPlayer() {
  const pad = 5;
  ctx.fillStyle = COLOR.player;
  ctx.beginPath();
  ctx.roundRect(
    player.x + pad, player.y + pad,
    TILE - pad * 2, TILE - pad * 2,
    8
  );
  ctx.fill();
  ctx.strokeStyle = COLOR.playerBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(player.x + 15, player.y + 17, 3, 0, Math.PI * 2);
  ctx.arc(player.x + 33, player.y + 17, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ── Loop ──────────────────────────────────────────────────
function loop() {
  update();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPlayer();
  requestAnimationFrame(loop);
}

buildGrid();
loop();
