// "Motor" del juego: aquí vive TODA la lógica (movimiento, disparos, choques, puntos).
// No sabe nada de React: solo recibe el estado, el tiempo que pasó y las teclas,
// y actualiza el estado. Separarlo así hace el código más fácil de entender y probar.

import {
  BEE_SPRITE,
  BOSS_HURT_SPRITE,
  BOSS_SPRITE,
  BUTTERFLY_SPRITE,
  PLAYER_SPRITE,
  drawSprite,
} from "./sprites";

// Tamaño "lógico" del juego. El canvas se estira en pantalla, pero
// por dentro siempre medimos en estas unidades.
export const WIDTH = 480;
export const HEIGHT = 640;

const SCALE = 3; // tamaño de cada pixel de los sprites
const PLAYER_SPEED = 260; // pixeles por segundo
const BULLET_SPEED = 520;
const ENEMY_BULLET_SPEED = 240;
const MAX_PLAYER_BULLETS = 2; // como en el Galaga original: máximo 2 balas a la vez
const START_LIVES = 3;

export type EnemyKind = "bee" | "butterfly" | "boss";
type EnemyMode = "formation" | "diving" | "returning";

export interface Enemy {
  kind: EnemyKind;
  hp: number;
  // Lugar que le toca en la formación (fila y columna)
  slotX: number;
  slotY: number;
  // Posición actual en pantalla
  x: number;
  y: number;
  mode: EnemyMode;
  // Datos del ataque en picada
  diveTime: number;
  diveStartX: number;
  diveDir: 1 | -1;
  hasShot: boolean;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Star {
  x: number;
  y: number;
  speed: number;
  color: string;
}

interface Explosion {
  x: number;
  y: number;
  time: number;
  color: string;
}

export type Phase = "menu" | "playing" | "gameover";

export interface GameState {
  phase: Phase;
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  playerX: number;
  playerAlive: boolean;
  respawnTimer: number; // segundos hasta reaparecer tras morir
  invulnerable: number; // segundos de invulnerabilidad al reaparecer
  shootCooldown: number;
  bullets: Bullet[];
  enemyBullets: Bullet[];
  enemies: Enemy[];
  stars: Star[];
  explosions: Explosion[];
  formationTime: number; // reloj para el vaivén de la formación
  diveTimer: number; // cuenta atrás para lanzar el siguiente ataque
  waveBanner: number; // segundos que se muestra "OLEADA X"
}

// Teclas que el componente de React nos pasa en cada cuadro
export interface Input {
  left: boolean;
  right: boolean;
  fire: boolean;
}

const PLAYER_Y = HEIGHT - 50;

// ---------- Creación del estado ----------

function makeStars(): Star[] {
  const colors = ["#ffffff", "#8888ff", "#ff8888", "#ffff88"];
  return Array.from({ length: 70 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    speed: 20 + Math.random() * 80,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}

// Arma la formación de enemigos: 1 fila de jefes, 2 de mariposas, 2 de abejas.
function makeWave(): Enemy[] {
  const rows: { kind: EnemyKind; cols: number }[] = [
    { kind: "boss", cols: 4 },
    { kind: "butterfly", cols: 8 },
    { kind: "butterfly", cols: 8 },
    { kind: "bee", cols: 10 },
    { kind: "bee", cols: 10 },
  ];
  const spacingX = 42;
  const spacingY = 36;
  const enemies: Enemy[] = [];
  rows.forEach((row, r) => {
    const rowWidth = (row.cols - 1) * spacingX;
    for (let c = 0; c < row.cols; c++) {
      const slotX = WIDTH / 2 - rowWidth / 2 + c * spacingX;
      const slotY = 80 + r * spacingY;
      enemies.push({
        kind: row.kind,
        hp: row.kind === "boss" ? 2 : 1,
        slotX,
        slotY,
        // Empiezan arriba fuera de pantalla y "vuelan" a su lugar
        x: slotX,
        y: -40 - r * 30,
        mode: "returning",
        diveTime: 0,
        diveStartX: slotX,
        diveDir: 1,
        hasShot: false,
      });
    }
  });
  return enemies;
}

export function createGame(highScore = 0): GameState {
  return {
    phase: "menu",
    score: 0,
    highScore,
    lives: START_LIVES,
    wave: 1,
    playerX: WIDTH / 2,
    playerAlive: true,
    respawnTimer: 0,
    invulnerable: 0,
    shootCooldown: 0,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    stars: makeStars(),
    explosions: [],
    formationTime: 0,
    diveTimer: 2.5,
    waveBanner: 0,
  };
}

export function startGame(state: GameState) {
  const fresh = createGame(state.highScore);
  Object.assign(state, fresh, {
    phase: "playing" as Phase,
    stars: state.stars,
    enemies: makeWave(),
    waveBanner: 2,
    invulnerable: 2,
  });
}

// ---------- Ayudantes ----------

// Dónde está ahora el "hueco" de un enemigo: la formación se mueve de lado a lado.
function slotPosition(state: GameState, e: Enemy) {
  const sway = Math.sin(state.formationTime * 0.8) * 30;
  return { x: e.slotX + sway, y: e.slotY };
}

function points(kind: EnemyKind, diving: boolean) {
  // Igual que en Galaga: vale más si lo derribas mientras te ataca
  if (kind === "boss") return diving ? 400 : 150;
  if (kind === "butterfly") return diving ? 160 : 80;
  return diving ? 100 : 50;
}

function enemyColor(kind: EnemyKind) {
  if (kind === "boss") return "#3bff6e";
  if (kind === "butterfly") return "#ff3b3b";
  return "#ffd23b";
}

// Choque simple entre dos rectángulos/círculos: ¿están cerca?
function hit(ax: number, ay: number, bx: number, by: number, dx: number, dy: number) {
  return Math.abs(ax - bx) < dx && Math.abs(ay - by) < dy;
}

function killPlayer(state: GameState) {
  state.playerAlive = false;
  state.explosions.push({ x: state.playerX, y: PLAYER_Y, time: 0, color: "#ffffff" });
  state.lives -= 1;
  state.bullets = [];
  if (state.lives <= 0) {
    state.phase = "gameover";
    state.highScore = Math.max(state.highScore, state.score);
  } else {
    state.respawnTimer = 1.5;
  }
}

// ---------- Actualización (se llama ~60 veces por segundo) ----------

export function update(state: GameState, dt: number, input: Input) {
  // Las estrellas siempre se mueven, incluso en el menú
  for (const s of state.stars) {
    s.y += s.speed * dt;
    if (s.y > HEIGHT) {
      s.y = 0;
      s.x = Math.random() * WIDTH;
    }
  }
  state.explosions = state.explosions.filter((ex) => (ex.time += dt) < 0.5);

  if (state.phase !== "playing") return;

  state.formationTime += dt;
  state.waveBanner = Math.max(0, state.waveBanner - dt);
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.shootCooldown = Math.max(0, state.shootCooldown - dt);

  // --- Jugador ---
  if (state.playerAlive) {
    if (input.left) state.playerX -= PLAYER_SPEED * dt;
    if (input.right) state.playerX += PLAYER_SPEED * dt;
    state.playerX = Math.max(25, Math.min(WIDTH - 25, state.playerX));

    if (input.fire && state.shootCooldown === 0 && state.bullets.length < MAX_PLAYER_BULLETS) {
      state.bullets.push({ x: state.playerX, y: PLAYER_Y - 20, vx: 0, vy: -BULLET_SPEED });
      state.shootCooldown = 0.18;
    }
  } else {
    state.respawnTimer -= dt;
    // Solo reaparece cuando no hay enemigos atacando, para ser justo
    const someoneDiving = state.enemies.some((e) => e.mode === "diving");
    if (state.respawnTimer <= 0 && !someoneDiving) {
      state.playerAlive = true;
      state.playerX = WIDTH / 2;
      state.invulnerable = 2;
      state.enemyBullets = [];
    }
  }

  // --- Balas ---
  for (const b of [...state.bullets, ...state.enemyBullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  state.bullets = state.bullets.filter((b) => b.y > -10);
  state.enemyBullets = state.enemyBullets.filter((b) => b.y < HEIGHT + 10 && b.x > -10 && b.x < WIDTH + 10);

  // --- Lanzar ataques en picada ---
  // Cada oleada los ataques son más frecuentes
  state.diveTimer -= dt;
  const inFormation = state.enemies.filter((e) => e.mode === "formation");
  const maxDivers = Math.min(2 + state.wave, 6);
  const diving = state.enemies.filter((e) => e.mode === "diving").length;
  if (state.diveTimer <= 0 && inFormation.length > 0 && state.playerAlive && diving < maxDivers) {
    const e = inFormation[Math.floor(Math.random() * inFormation.length)];
    e.mode = "diving";
    e.diveTime = 0;
    e.diveStartX = e.x;
    e.diveDir = e.x < WIDTH / 2 ? 1 : -1;
    e.hasShot = false;
    state.diveTimer = Math.max(0.5, 2.2 - state.wave * 0.2) * (0.6 + Math.random() * 0.8);
  }

  // --- Mover enemigos ---
  const diveSpeed = 170 + state.wave * 15;
  for (const e of state.enemies) {
    const slot = slotPosition(state, e);
    if (e.mode === "formation") {
      e.x = slot.x;
      e.y = slot.y;
    } else if (e.mode === "returning") {
      // Vuela hacia su hueco en la formación
      const dx = slot.x - e.x;
      const dy = slot.y - e.y;
      const dist = Math.hypot(dx, dy);
      const step = 220 * dt;
      if (dist <= step) {
        e.mode = "formation";
        e.x = slot.x;
        e.y = slot.y;
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    } else {
      // En picada: primero un pequeño rizo hacia arriba, luego baja en zigzag
      // persiguiendo un poco al jugador.
      e.diveTime += dt;
      const t = e.diveTime;
      if (t < 0.5) {
        const angle = (t / 0.5) * Math.PI;
        e.x = e.diveStartX + e.diveDir * (1 - Math.cos(angle)) * 25;
        e.y = slot.y - Math.sin(angle) * 30;
      } else {
        e.y += diveSpeed * dt;
        const chase = Math.sign(state.playerX - e.x) * 60;
        e.x += (Math.sin(t * 3) * 120 * e.diveDir + chase) * dt;
      }
      // Dispara una vez cuando va bajando
      if (!e.hasShot && e.y > 220 && state.playerAlive) {
        e.hasShot = true;
        const dx = state.playerX - e.x;
        const dy = PLAYER_Y - e.y;
        const len = Math.hypot(dx, dy);
        state.enemyBullets.push({
          x: e.x,
          y: e.y + 10,
          vx: (dx / len) * ENEMY_BULLET_SPEED * 0.5,
          vy: ENEMY_BULLET_SPEED,
        });
      }
      // Si sale por abajo, vuelve a aparecer arriba y regresa a la formación
      if (e.y > HEIGHT + 30) {
        e.y = -30;
        e.x = slot.x;
        e.mode = "returning";
      }
    }
  }

  // --- Choques: balas del jugador contra enemigos ---
  for (const b of state.bullets) {
    for (const e of state.enemies) {
      if (e.hp > 0 && hit(b.x, b.y, e.x, e.y, 20, 14)) {
        e.hp -= 1;
        b.y = -100; // la bala desaparece
        if (e.hp <= 0) {
          state.score += points(e.kind, e.mode === "diving");
          state.explosions.push({ x: e.x, y: e.y, time: 0, color: enemyColor(e.kind) });
        }
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.y > -10);
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // --- Choques contra el jugador ---
  if (state.playerAlive && state.invulnerable === 0) {
    const shot = state.enemyBullets.find((b) => hit(b.x, b.y, state.playerX, PLAYER_Y, 16, 14));
    const rammer = state.enemies.find((e) => hit(e.x, e.y, state.playerX, PLAYER_Y, 30, 26));
    if (shot || rammer) {
      if (shot) shot.y = HEIGHT + 100;
      if (rammer) {
        rammer.hp = 0;
        state.score += points(rammer.kind, true);
        state.explosions.push({ x: rammer.x, y: rammer.y, time: 0, color: enemyColor(rammer.kind) });
        state.enemies = state.enemies.filter((e) => e.hp > 0);
      }
      killPlayer(state);
    }
  }

  if (state.score > state.highScore) state.highScore = state.score;

  // --- ¿Oleada terminada? Viene la siguiente ---
  if (state.phase === "playing" && state.enemies.length === 0) {
    state.wave += 1;
    state.enemies = makeWave();
    state.enemyBullets = [];
    state.waveBanner = 2;
    state.diveTimer = 3;
  }
}

// ---------- Dibujo ----------

function enemySprite(e: Enemy) {
  if (e.kind === "boss") return e.hp === 2 ? BOSS_SPRITE : BOSS_HURT_SPRITE;
  if (e.kind === "butterfly") return BUTTERFLY_SPRITE;
  return BEE_SPRITE;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string,
  size = 16,
  align: CanvasTextAlign = "center",
) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

export function draw(ctx: CanvasRenderingContext2D, state: GameState) {
  // Fondo negro
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Estrellas (parpadean un poco)
  for (const s of state.stars) {
    if (Math.random() < 0.03) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 2, 2);
  }

  // Enemigos
  for (const e of state.enemies) {
    drawSprite(ctx, enemySprite(e), e.x, e.y, SCALE);
  }

  // Jugador (parpadea mientras es invulnerable)
  const blink = state.invulnerable > 0 && Math.floor(state.invulnerable * 10) % 2 === 0;
  if (state.phase === "playing" && state.playerAlive && !blink) {
    drawSprite(ctx, PLAYER_SPRITE, state.playerX, PLAYER_Y, SCALE);
  }

  // Balas
  ctx.fillStyle = "#3bf0ff";
  for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 7, 3, 14);
  ctx.fillStyle = "#ff3b3b";
  for (const b of state.enemyBullets) ctx.fillRect(b.x - 2, b.y - 5, 4, 10);

  // Explosiones: círculos que crecen y se desvanecen
  for (const ex of state.explosions) {
    const p = ex.time / 0.5;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = ex.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, 6 + p * 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillRect(ex.x + Math.cos(a) * p * 30, ex.y + Math.sin(a) * p * 30, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // Marcador
  text(ctx, "PUNTOS", 12, 22, "#ff3b3b", 14, "left");
  text(ctx, String(state.score), 12, 40, "#ffffff", 16, "left");
  text(ctx, "RÉCORD", WIDTH / 2, 22, "#ff3b3b", 14);
  text(ctx, String(state.highScore), WIDTH / 2, 40, "#ffffff", 16);
  text(ctx, `OLEADA ${state.wave}`, WIDTH - 12, 22, "#3bf0ff", 14, "right");

  // Vidas: navecitas abajo a la izquierda
  if (state.phase === "playing") {
    const spare = state.lives - (state.playerAlive ? 1 : 0);
    for (let i = 0; i < spare; i++) {
      drawSprite(ctx, PLAYER_SPRITE, 22 + i * 30, HEIGHT - 14, 1.6);
    }
  }

  if (state.phase === "playing" && state.waveBanner > 0) {
    text(ctx, `OLEADA ${state.wave}`, WIDTH / 2, HEIGHT / 2, "#3bf0ff", 28);
  }

  if (state.phase === "menu") {
    text(ctx, "GALAXIA", WIDTH / 2, 230, "#ffd23b", 48);
    text(ctx, "Pulsa ENTER o toca para jugar", WIDTH / 2, 300, "#ffffff", 16);
    text(ctx, "← → mover   ESPACIO disparar", WIDTH / 2, 340, "#3bf0ff", 14);
    drawSprite(ctx, BOSS_SPRITE, WIDTH / 2 - 90, 420, SCALE);
    text(ctx, "150 / 400", WIDTH / 2 - 90, 455, "#ffffff", 12);
    drawSprite(ctx, BUTTERFLY_SPRITE, WIDTH / 2, 420, SCALE);
    text(ctx, "80 / 160", WIDTH / 2, 455, "#ffffff", 12);
    drawSprite(ctx, BEE_SPRITE, WIDTH / 2 + 90, 420, SCALE);
    text(ctx, "50 / 100", WIDTH / 2 + 90, 455, "#ffffff", 12);
    text(ctx, "(en formación / atacando)", WIDTH / 2, 480, "#888888", 12);
  }

  if (state.phase === "gameover") {
    text(ctx, "GAME OVER", WIDTH / 2, HEIGHT / 2 - 20, "#ff3b3b", 40);
    text(ctx, `Puntos: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 20, "#ffffff", 18);
    text(ctx, "Pulsa ENTER o toca para reintentar", WIDTH / 2, HEIGHT / 2 + 60, "#ffd23b", 14);
  }
}
