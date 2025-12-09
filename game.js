const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const messageEl = document.getElementById("message");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");
const mobileControlsContainer = document.getElementById("mobile-controls");
const ctrlButtons = document.querySelectorAll(".ctrl-btn");

// Detect touch device – hide pad on PC/laptop
const isTouch =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  navigator.msMaxTouchPoints > 0;

if (!isTouch && mobileControlsContainer) {
  mobileControlsContainer.style.display = "none";
}

// Basic NES-style grid
const TILE_SIZE = 32;
const GRID_WIDTH = 15;
const GRID_HEIGHT = 11;

const TILE = {
  FLOOR: 0,
  WALL: 1,
};

let tiles;
let player;
let blocks;
let keys;
let door;
let enemies;
let totalKeys;
let keysCollected;
let messageTimeoutId = null;

let enemyStepCounter = 0;
// HR moves less often (slower patrol)
const ENEMY_STEP_FRAMES = 40;

// Level layout
// # = wall, P = player, B = block, K = key, D = door, E = enemy
const rawMap = [
  "###############",
  "#P   B    K  D#",
  "#   ###   ### #",
  "#   # E       #",
  "#   #   B     #",
  "#   ###   ### #",
  "#   K         #",
  "#       B     #",
  "#   ###   ### #",
  "#          K  #",
  "###############",
];

// --- Corporate one-liners ---

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const START_MESSAGES = [
  "Welcome to the performance maze. KPI #1: don't get fired.",
  "New quarter started. Objective: exit the office alive.",
  "Corporate says: 'Think outside the cubicle.' Try to escape it first."
];

const KEY_MESSAGES = [
  "Key collected. One step closer to escaping open space.",
  "Key added. Your 'find-exit' project moved to the next milestone.",
  "You picked a key. Finally, progress that isn't a meeting."
];

const ALL_KEYS_MESSAGES = [
  "All objectives completed. Exit interview unlocked.",
  "All keys collected. Your 'escape plan' dashboard is now green.",
  "Checklist: 100% done. Time to find the nearest exit."
];

const DOOR_LOCKED_MESSAGES = [
  "Door is locked. Corporate says: 'Not all deliverables are ready.'",
  "Access denied. Your KPI is still 'in progress'.",
  "Exit unavailable. Please finish all mandatory tasks first."
];

const DEATH_MESSAGES = [
  "Your KPI report: 'needs improvement'. Try the quarter again.",
  "You missed the deadline. System is rolling back the sprint.",
  "HR scheduled a 'development talk'. It didn't end well.",
  "Performance rating: 'below expectations'. Respawn recommended.",
  "You stepped into a surprise audit. Please reattempt compliance."
];

const WIN_MESSAGES = [
  "Quarter closed successfully. Your bonus: another level.",
  "You survived this sprint. Title updated to 'Still Employed'.",
  "Performance rating: 'barely meets expectations', but you're alive.",
  "Corporate congratulates you with a generic email. You escaped!"
];

// --- UI helpers ---

function showMessage(text, duration = 6500) {
  // default ~6.5 seconds
  messageEl.textContent = text;
  if (messageTimeoutId) clearTimeout(messageTimeoutId);
  if (duration > 0) {
    messageTimeoutId = setTimeout(() => {
      messageEl.textContent = "";
    }, duration);
  }
}

function updateStatus() {
  statusEl.textContent = `Keys collected: ${keysCollected}/${totalKeys}`;
}

// --- Level setup ---

function resetLevel() {
  tiles = [];
  blocks = [];
  keys = [];
  enemies = [];
  door = null;
  player = null;
  keysCollected = 0;
  totalKeys = 0;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const ch = rawMap[y][x];

      if (ch === "#") {
        tiles[y][x] = TILE.WALL;
      } else {
        tiles[y][x] = TILE.FLOOR;
      }

      if (ch === "P") {
        player = { x, y };
      } else if (ch === "B") {
        blocks.push({ x, y });
      } else if (ch === "K") {
        keys.push({ x, y, collected: false });
        totalKeys++;
      } else if (ch === "D") {
        door = { x, y, open: false };
      } else if (ch === "E") {
        enemies.push({ x, y, dir: 1 }); // move right initially
      }
    }
  }

  updateStatus();
  showMessage(rand(START_MESSAGES), 7000);
}

// --- Helpers ---

function isInsideGrid(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function isWall(x, y) {
  return tiles[y][x] === TILE.WALL;
}

function findBlockAt(x, y) {
  return blocks.find((b) => b.x === x && b.y === y);
}

function findKeyAt(x, y) {
  return keys.find((k) => k.x === x && k.y === y && !k.collected);
}

function isEnemyAt(x, y) {
  return enemies.some((e) => e.x === x && e.y === y);
}

function isBlockingTile(x, y) {
  if (!isInsideGrid(x, y)) return true;
  if (isWall(x, y)) return true;
  if (findBlockAt(x, y)) return true;
  return false;
}

// --- Player movement ---

function tryMovePlayer(dx, dy) {
  const targetX = player.x + dx;
  const targetY = player.y + dy;

  if (!isInsideGrid(targetX, targetY)) return;

  // Enemy on target tile?
  if (isEnemyAt(targetX, targetY)) {
    handleDeath();
    return;
  }

  // Door?
  if (door && targetX === door.x && targetY === door.y) {
    if (door.open) {
      handleWin();
    } else {
      showMessage(rand(DOOR_LOCKED_MESSAGES));
    }
    return;
  }

  const block = findBlockAt(targetX, targetY);

  if (block) {
    // Try to push block
    const behindX = targetX + dx;
    const behindY = targetY + dy;

    if (!isInsideGrid(behindX, behindY)) return;
    if (isBlockingTile(behindX, behindY)) return;

    // Move block
    block.x = behindX;
    block.y = behindY;

    // Move player into block's old position
    player.x = targetX;
    player.y = targetY;
  } else if (!isWall(targetX, targetY)) {
    // Free movement
    player.x = targetX;
    player.y = targetY;
  }

  // After move: collect key if present
  const key = findKeyAt(player.x, player.y);
  if (key && !key.collected) {
    key.collected = true;
    keysCollected++;
    updateStatus();
    showMessage(rand(KEY_MESSAGES));

    if (keysCollected === totalKeys) {
      door.open = true;
      showMessage(rand(ALL_KEYS_MESSAGES), 7000);
    }
  }
}

// --- Outcomes ---

function handleDeath() {
  showMessage(rand(DEATH_MESSAGES), 7500);
  setTimeout(resetLevel, 400);
}

function handleWin() {
  showMessage(rand(WIN_MESSAGES), 8000);
  setTimeout(resetLevel, 1200);
}

// --- Enemy movement ---

function moveEnemies() {
  enemies.forEach((e) => {
    const nextX = e.x + e.dir;
    const nextY = e.y;

    if (!isInsideGrid(nextX, nextY) || isWall(nextX, nextY) || findBlockAt(nextX, nextY)) {
      e.dir *= -1; // reverse direction
    } else {
      e.x = nextX;
    }

    // Collision with player
    if (e.x === player.x && e.y === player.y) {
      handleDeath();
    }
  });
}

// --- Drawing ---

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Tiles
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const tile = tiles[y][x];

      if (tile === TILE.FLOOR) {
        ctx.fillStyle = "#1b2838";
      } else if (tile === TILE.WALL) {
        ctx.fillStyle = "#3b4a5a";
      }

      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // Door
  if (door) {
    ctx.fillStyle = door.open ? "#4caf50" : "#795548";
    ctx.fillRect(
      door.x * TILE_SIZE + 4,
      door.y * TILE_SIZE + 4,
      TILE_SIZE - 8,
      TILE_SIZE - 8
    );
  }

  // Keys
  keys.forEach((k) => {
    if (!k.collected) {
      const cx = k.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = k.y * TILE_SIZE + TILE_SIZE / 2;
      ctx.fillStyle = "#ffeb3b";
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE / 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Blocks (office boxes)
  blocks.forEach((b) => {
    ctx.fillStyle = "#42a5f5";
    ctx.fillRect(
      b.x * TILE_SIZE + 4,
      b.y * TILE_SIZE + 4,
      TILE_SIZE - 8,
      TILE_SIZE - 8
    );
  });

  // Enemies (HR patrol)
  enemies.forEach((e) => {
    ctx.fillStyle = "#e53935";
    ctx.fillRect(
      e.x * TILE_SIZE + 6,
      e.y * TILE_SIZE + 6,
      TILE_SIZE - 12,
      TILE_SIZE - 12
    );
  });

  // Player
  ctx.fillStyle = "#00e5ff";
  ctx.fillRect(
    player.x * TILE_SIZE + 6,
    player.y * TILE_SIZE + 4,
    TILE_SIZE - 12,
    TILE_SIZE - 8
  );

  // Head
  ctx.fillStyle = "#e0f7fa";
  ctx.fillRect(
    player.x * TILE_SIZE + 10,
    player.y * TILE_SIZE + 6,
    TILE_SIZE - 20,
    TILE_SIZE - 18
  );
}

// --- Game loop ---

function gameLoop() {
  enemyStepCounter++;
  if (enemyStepCounter >= ENEMY_STEP_FRAMES) {
    moveEnemies();
    enemyStepCounter = 0;
  }

  draw();
  requestAnimationFrame(gameLoop);
}

// --- Controls ---

document.addEventListener("keydown", (e) => {
  let handled = false;

  switch (e.key) {
    case "ArrowUp":
      tryMovePlayer(0, -1);
      handled = true;
      break;
    case "ArrowDown":
      tryMovePlayer(0, 1);
      handled = true;
      break;
    case "ArrowLeft":
      tryMovePlayer(-1, 0);
      handled = true;
      break;
    case "ArrowRight":
      tryMovePlayer(1, 0);
      handled = true;
      break;
  }

  if (handled) {
    e.preventDefault();
  }
});

ctrlButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const dir = btn.getAttribute("data-dir");
    if (dir === "up") tryMovePlayer(0, -1);
    if (dir === "down") tryMovePlayer(0, 1);
    if (dir === "left") tryMovePlayer(-1, 0);
    if (dir === "right") tryMovePlayer(1, 0);
  });
});

restartBtn.addEventListener("click", () => {
  resetLevel();
});

// --- Init ---
resetLevel();
requestAnimationFrame(gameLoop);
