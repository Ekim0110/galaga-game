// "Motor" del juego: aquí vive TODA la lógica (movimiento, disparos, choques, puntos, niveles).
// No sabe nada de React: solo recibe el estado, el tiempo que pasó y las teclas,
// y actualiza el estado. Separarlo así hace el código más fácil de entender y probar.

import type { SoundEvent } from "./sound";
import {
  BEE_SPRITE,
  BOSS_HURT_SPRITE,
  BOSS_SPRITE,
  BUTTERFLY_SPRITE,
  MOTHERSHIP_FLASH_SPRITE,
  MOTHERSHIP_SPRITE,
  PLAYER_SPRITE,
  drawSprite,
} from "./sprites";

// Tamaño "lógico" del juego. El canvas se estira en pantalla, pero
// por dentro siempre medimos en estas unidades.
export const WIDTH = 480;
export const HEIGHT = 640;

const SCALE = 3; // tamaño de cada pixel de los sprites
const PLAYER_SPEED = 330; // pixeles por segundo (más alto = nave más ágil)
const BULLET_SPEED = 520;
const MAX_PLAYER_BULLETS = 2; // como en el Galaga original: máximo 2 balas a la vez
const START_LIVES = 3;
const EXTRA_LIFE_EVERY = 20000; // puntos para ganar una vida extra
const PLAYER_Y = HEIGHT - 50;

export type EnemyKind = "bee" | "butterfly" | "boss";
// formation = quieto en su lugar, diving = atacando, returning = volviendo,
// challenge = volando por una ruta en la fase de desafío
type EnemyMode = "formation" | "diving" | "returning" | "challenge";

export interface Enemy {
  kind: EnemyKind;
  hp: number;
  slotX: number; // lugar que le toca en la formación
  slotY: number;
  x: number; // posición actual en pantalla
  y: number;
  mode: EnemyMode;
  diveTime: number;
  diveStartX: number;
  diveDir: 1 | -1;
  shotsLeft: number; // cuántas balas le quedan en este ataque
  nextShotY: number; // altura a la que dispara la siguiente bala
  // Solo para la fase de desafío:
  path: number;
  delay: number;
  escort: boolean; // true = lo lanzó la nave nodriza; se va al salir de la pantalla
}

// La nave nodriza: un jefe grande con mucha vida
export interface Mothership {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  time: number;
  shootTimer: number;
  spawnTimer: number;
  flash: number; // segundos que se ve blanca tras un impacto
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

// Texto flotante (por ejemplo "+400") que aparece donde muere un enemigo
interface Popup {
  x: number;
  y: number;
  text: string;
  time: number;
}

export type Phase = "menu" | "playing" | "levelclear" | "gameover";

export interface GameState {
  phase: Phase;
  score: number;
  highScore: number;
  nextExtraLife: number;
  lives: number;
  level: number;
  playerX: number;
  playerAlive: boolean;
  respawnTimer: number;
  invulnerable: number;
  shootCooldown: number;
  bullets: Bullet[];
  enemyBullets: Bullet[];
  enemies: Enemy[];
  mothership: Mothership | null;
  stars: Star[];
  explosions: Explosion[];
  popups: Popup[];
  formationTime: number;
  diveTimer: number;
  levelBanner: number; // segundos que se muestra "NIVEL X"
  phaseTimer: number; // tiempo restante de la pantalla de "nivel completado"
  // Fase de desafío
  challengeHits: number;
  challengeTotal: number;
  challengeBonus: number;
  // Sonidos que el motor pide; el componente de React los reproduce
  events: SoundEvent[];
}

export interface Input {
  left: boolean;
  right: boolean;
  fire: boolean;
  // En el celular: posición X del dedo sobre el juego (null = no está tocando)
  targetX: number | null;
}

// ---------- Niveles ----------

// Cada formación es un dibujo: B = jefe, R = mariposa, Y = abeja, . = vacío.
// Así es fácil inventar niveles nuevos: solo dibujas otra forma.
const LAYOUTS: string[][] = [
  // Nivel 1: la clásica
  [
    "...BBBB...",
    ".RRRRRRRR.",
    ".RRRRRRRR.",
    "YYYYYYYYYY",
    "YYYYYYYYYY",
  ],
  // Nivel 2: forma de V
  [
    "B........B",
    "RB......BR",
    ".RR....RR.",
    "..YYYYYY..",
    "...YYYY...",
    "....YY....",
  ],
  // Nivel 4: diamante
  [
    "....BB....",
    "...RRRR...",
    "..RRBBRR..",
    ".YYYYYYYY.",
    "..YYYYYY..",
    "...YYYY...",
  ],
  // Nivel 5: fortaleza
  [
    "B.B.BB.B.B",
    "RRRRRRRRRR",
    "R.YYYYYY.R",
    "R.YYYYYY.R",
    "YYYYYYYYYY",
  ],
  // Nivel 7: dos alas
  [
    "BB......BB",
    "RRR....RRR",
    "RRRY..YRRR",
    "YYYYYYYYYY",
    ".YYY..YYY.",
  ],
];

// Cada 5 niveles aparece la nave nodriza.
export function isBossLevel(level: number) {
  return level % 5 === 0;
}

// Cada 3 niveles hay una "fase de desafío" (como en Galaga), salvo si toca nodriza.
export function isChallengeLevel(level: number) {
  return level % 3 === 0 && !isBossLevel(level);
}

function isNormalLevel(level: number) {
  return !isBossLevel(level) && !isChallengeLevel(level);
}

// Los números de dificultad suben con el nivel, pero con un tope para que siga siendo jugable.
function difficulty(level: number) {
  return {
    diveSpeed: Math.min(160 + level * 18, 340),
    maxDivers: Math.min(1 + level, 7),
    diveInterval: Math.max(0.45, 2.3 - level * 0.2),
    shotsPerDive: level < 3 ? 1 : level < 6 ? 2 : 3,
    enemyBulletSpeed: Math.min(220 + level * 12, 360),
    swaySpeed: 0.8 + level * 0.05,
  };
}

function newEnemy(kind: EnemyKind, slotX: number, slotY: number): Enemy {
  return {
    kind,
    hp: kind === "boss" ? 2 : 1,
    slotX,
    slotY,
    x: slotX,
    y: -40,
    mode: "returning",
    diveTime: 0,
    diveStartX: slotX,
    diveDir: 1,
    shotsLeft: 0,
    nextShotY: 0,
    path: 0,
    delay: 0,
    escort: false,
  };
}

function makeFormation(level: number): Enemy[] {
  // Cuál formación toca: contamos los niveles normales anteriores
  let normalIndex = 0;
  for (let l = 1; l < level; l++) if (isNormalLevel(l)) normalIndex++;
  const layout = LAYOUTS[normalIndex % LAYOUTS.length];
  const spacingX = 42;
  const spacingY = 34;
  const enemies: Enemy[] = [];
  layout.forEach((row, r) => {
    const rowWidth = (row.length - 1) * spacingX;
    [...row].forEach((ch, c) => {
      const kind: EnemyKind | null = ch === "B" ? "boss" : ch === "R" ? "butterfly" : ch === "Y" ? "bee" : null;
      if (!kind) return;
      const e = newEnemy(kind, WIDTH / 2 - rowWidth / 2 + c * spacingX, 80 + r * spacingY);
      // Entran desde arriba, desde la izquierda o la derecha según la columna
      e.x = c < row.length / 2 ? -30 - r * 20 : WIDTH + 30 + r * 20;
      e.y = -30 - r * 25;
      enemies.push(e);
    });
  });
  return enemies;
}

// Rutas de la fase de desafío: dado un tiempo t (segundos) devuelven una posición.
function challengePath(path: number, t: number) {
  switch (path % 4) {
    case 0: // ola de izquierda a derecha
      return { x: -30 + t * 130, y: 120 + Math.sin(t * 1.8) * 110 + t * 25 };
    case 1: // ola de derecha a izquierda
      return { x: WIDTH + 30 - t * 130, y: 120 + Math.sin(t * 1.8) * 110 + t * 25 };
    case 2: {
      // espiral bajando por el centro
      const a = t * 2.4;
      const r = 30 + t * 30;
      return { x: WIDTH / 2 + Math.cos(a) * r * 1.5, y: -20 + t * 75 + Math.sin(a) * r * 0.6 };
    }
    default: // rizo: baja, da una vuelta y sale por la derecha
      return { x: 40 + t * 85 + Math.cos(t * 3) * 70, y: -30 + t * 60 + Math.sin(t * 3) * 80 };
  }
}

function makeChallenge(level: number): Enemy[] {
  const kinds: EnemyKind[] = ["bee", "butterfly", "boss", "butterfly", "bee"];
  const enemies: Enemy[] = [];
  const groups = 5;
  const perGroup = 8;
  const speedUp = Math.min(level / 30, 0.3); // los desafíos posteriores llegan más rápido
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < perGroup; i++) {
      const e = newEnemy(kinds[g], 0, 0);
      e.hp = 1; // en el desafío todos caen de un disparo
      e.mode = "challenge";
      e.path = g + Math.floor(level / 3);
      e.delay = g * (3.6 - speedUp * 3) + i * 0.22;
      e.x = -100;
      e.y = -100;
      enemies.push(e);
    }
  }
  return enemies;
}

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

export function createGame(highScore = 0): GameState {
  return {
    phase: "menu",
    score: 0,
    highScore,
    nextExtraLife: EXTRA_LIFE_EVERY,
    lives: START_LIVES,
    level: 1,
    playerX: WIDTH / 2,
    playerAlive: true,
    respawnTimer: 0,
    invulnerable: 0,
    shootCooldown: 0,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    mothership: null,
    stars: makeStars(),
    explosions: [],
    popups: [],
    formationTime: 0,
    diveTimer: 3,
    levelBanner: 0,
    phaseTimer: 0,
    challengeHits: 0,
    challengeTotal: 0,
    challengeBonus: 0,
    events: [],
  };
}

function makeMothership(level: number): Mothership {
  const hp = 24 + level * 2; // más vida en cada aparición
  return { x: WIDTH / 2, y: -60, hp, maxHp: hp, time: 0, shootTimer: 2.5, spawnTimer: 4, flash: 0 };
}

function beginLevel(state: GameState) {
  const challenge = isChallengeLevel(state.level);
  const boss = isBossLevel(state.level);
  state.phase = "playing";
  state.enemies = boss ? [] : challenge ? makeChallenge(state.level) : makeFormation(state.level);
  state.mothership = boss ? makeMothership(state.level) : null;
  state.enemyBullets = [];
  state.bullets = [];
  state.levelBanner = 2;
  state.diveTimer = 3;
  state.formationTime = 0;
  state.challengeHits = 0;
  state.challengeTotal = challenge ? state.enemies.length : 0;
  state.challengeBonus = 0;
  state.events.push(boss ? "bossAppear" : challenge ? "challengeStart" : "levelStart");
}

// "startLevel" permite empezar en otro nivel (solo lo usamos para probar).
export function startGame(state: GameState, startLevel = 1) {
  const fresh = createGame(state.highScore);
  Object.assign(state, fresh, { stars: state.stars, invulnerable: 2, level: startLevel });
  beginLevel(state);
}

// ---------- Ayudantes ----------

function slotPosition(state: GameState, e: Enemy) {
  // La formación se mece de lado a lado
  const sway = Math.sin(state.formationTime * difficulty(state.level).swaySpeed) * 30;
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

function hit(ax: number, ay: number, bx: number, by: number, dx: number, dy: number) {
  return Math.abs(ax - bx) < dx && Math.abs(ay - by) < dy;
}

function addScore(state: GameState, amount: number, x: number, y: number) {
  state.score += amount;
  if (amount >= 150) state.popups.push({ x, y, text: String(amount), time: 0 });
  if (state.score >= state.nextExtraLife) {
    state.lives += 1;
    state.nextExtraLife += EXTRA_LIFE_EVERY;
    state.events.push("extraLife");
  }
  if (state.score > state.highScore) state.highScore = state.score;
}

function killPlayer(state: GameState) {
  state.playerAlive = false;
  state.explosions.push({ x: state.playerX, y: PLAYER_Y, time: 0, color: "#ffffff" });
  state.lives -= 1;
  state.bullets = [];
  state.events.push("playerDie");
  if (state.lives <= 0) {
    state.phase = "gameover";
    state.events.push("gameOver");
  } else {
    state.respawnTimer = 1.5;
  }
}

// ---------- Actualización (se llama ~60 veces por segundo) ----------

export function update(state: GameState, dt: number, input: Input) {
  for (const s of state.stars) {
    s.y += s.speed * dt;
    if (s.y > HEIGHT) {
      s.y = 0;
      s.x = Math.random() * WIDTH;
    }
  }
  state.explosions = state.explosions.filter((ex) => (ex.time += dt) < 0.5);
  state.popups = state.popups.filter((p) => (p.time += dt) < 0.9);

  // Pantalla de "nivel completado": esperamos y pasamos al siguiente
  if (state.phase === "levelclear") {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.level += 1;
      beginLevel(state);
    }
    return;
  }

  if (state.phase !== "playing") return;

  const diff = difficulty(state.level);
  const challenge = isChallengeLevel(state.level);

  state.formationTime += dt;
  state.levelBanner = Math.max(0, state.levelBanner - dt);
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.shootCooldown = Math.max(0, state.shootCooldown - dt);

  // --- Jugador ---
  if (state.playerAlive) {
    if (input.targetX !== null) {
      // Con el dedo: la nave va hacia donde tocas, muy rápido pero sin teletransportarse
      const dx = input.targetX - state.playerX;
      const maxStep = PLAYER_SPEED * 1.8 * dt;
      state.playerX += Math.max(-maxStep, Math.min(maxStep, dx));
    } else {
      if (input.left) state.playerX -= PLAYER_SPEED * dt;
      if (input.right) state.playerX += PLAYER_SPEED * dt;
    }
    state.playerX = Math.max(25, Math.min(WIDTH - 25, state.playerX));

    if (input.fire && state.shootCooldown === 0 && state.bullets.length < MAX_PLAYER_BULLETS) {
      state.bullets.push({ x: state.playerX, y: PLAYER_Y - 20, vx: 0, vy: -BULLET_SPEED });
      state.shootCooldown = 0.18;
      state.events.push("shoot");
    }
  } else {
    state.respawnTimer -= dt;
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

  // --- Lanzar ataques en picada (solo en niveles normales) ---
  if (!challenge) {
    state.diveTimer -= dt;
    const inFormation = state.enemies.filter((e) => e.mode === "formation");
    const diving = state.enemies.filter((e) => e.mode === "diving").length;
    if (state.diveTimer <= 0 && inFormation.length > 0 && state.playerAlive && diving < diff.maxDivers) {
      const e = inFormation[Math.floor(Math.random() * inFormation.length)];
      e.mode = "diving";
      e.diveTime = 0;
      e.diveStartX = e.x;
      e.diveDir = e.x < WIDTH / 2 ? 1 : -1;
      e.shotsLeft = diff.shotsPerDive;
      e.nextShotY = 200;
      state.diveTimer = diff.diveInterval * (0.6 + Math.random() * 0.8);
      state.events.push("dive");
    }
  }

  // --- Nave nodriza ---
  const m = state.mothership;
  if (m) {
    m.time += dt;
    m.flash = Math.max(0, m.flash - dt);
    const angry = m.hp < m.maxHp / 2; // con poca vida se enoja y ataca más
    // Entra desde arriba y luego se mece de lado a lado
    if (m.y < 130) m.y += 70 * dt;
    else m.y = 130 + Math.sin(m.time * 0.9) * 18;
    m.x = WIDTH / 2 + Math.sin(m.time * (angry ? 0.9 : 0.6)) * 150;
    const ready = m.y >= 120;

    // Disparo en abanico apuntando al jugador
    m.shootTimer -= dt;
    if (ready && m.shootTimer <= 0 && state.playerAlive) {
      const n = 3 + Math.min(Math.floor(state.level / 5) - 1, 2) + (angry ? 1 : 0);
      const base = Math.atan2(PLAYER_Y - m.y, state.playerX - m.x);
      const speed = diff.enemyBulletSpeed * 0.85;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        state.enemyBullets.push({ x: m.x, y: m.y + 25, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      }
      m.shootTimer = Math.max(0.9, 1.9 - state.level * 0.04) * (angry ? 0.7 : 1);
    }

    // Lanza abejas escoltas que bajan en picada
    m.spawnTimer -= dt;
    const escorts = state.enemies.filter((e) => e.escort).length;
    if (ready && m.spawnTimer <= 0 && escorts < 6 && state.playerAlive) {
      for (const side of [-1, 1] as const) {
        const e = newEnemy("bee", m.x + side * 40, m.y + 20);
        e.x = e.slotX;
        e.y = e.slotY;
        e.mode = "diving";
        e.diveTime = 0.5; // se salta el rizo inicial
        e.diveDir = side;
        e.escort = true;
        e.shotsLeft = 1;
        e.nextShotY = m.y + 90;
        state.enemies.push(e);
      }
      m.spawnTimer = angry ? 3 : 4.5;
      state.events.push("dive");
    }
  }

  // --- Mover enemigos ---
  for (const e of state.enemies) {
    if (e.mode === "challenge") {
      // Fase de desafío: siguen su ruta y luego se van. No disparan.
      e.delay -= dt;
      if (e.delay > 0) continue;
      const pos = challengePath(e.path, -e.delay);
      e.x = pos.x;
      e.y = pos.y;
      const gone = -e.delay > 1.5 && (e.x < -60 || e.x > WIDTH + 60 || e.y > HEIGHT + 60);
      if (gone || -e.delay > 9) e.hp = -1; // -1 = escapó (no cuenta como derribado)
      continue;
    }

    const slot = slotPosition(state, e);
    if (e.mode === "formation") {
      e.x = slot.x;
      e.y = slot.y;
    } else if (e.mode === "returning") {
      const dx = slot.x - e.x;
      const dy = slot.y - e.y;
      const dist = Math.hypot(dx, dy);
      const step = 230 * dt;
      if (dist <= step) {
        e.mode = "formation";
        e.x = slot.x;
        e.y = slot.y;
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    } else {
      // En picada: un pequeño rizo y luego baja en zigzag persiguiendo un poco al jugador
      e.diveTime += dt;
      const t = e.diveTime;
      if (t < 0.5) {
        const angle = (t / 0.5) * Math.PI;
        e.x = e.diveStartX + e.diveDir * (1 - Math.cos(angle)) * 25;
        e.y = slot.y - Math.sin(angle) * 30;
      } else {
        e.y += diff.diveSpeed * dt;
        const chase = Math.sign(state.playerX - e.x) * (40 + state.level * 6);
        e.x += (Math.sin(t * 3) * 120 * e.diveDir + chase) * dt;
      }
      // Dispara una o varias balas mientras baja
      if (e.shotsLeft > 0 && e.y > e.nextShotY && e.y < PLAYER_Y - 80 && state.playerAlive) {
        e.shotsLeft -= 1;
        e.nextShotY += 60;
        const dx = state.playerX - e.x;
        const dy = PLAYER_Y - e.y;
        const len = Math.hypot(dx, dy);
        state.enemyBullets.push({
          x: e.x,
          y: e.y + 10,
          vx: (dx / len) * diff.enemyBulletSpeed * 0.5,
          vy: diff.enemyBulletSpeed,
        });
      }
      if (e.y > HEIGHT + 30 && e.escort) {
        e.hp = -1; // las escoltas no vuelven: desaparecen
      } else if (e.y > HEIGHT + 30) {
        e.y = -30;
        e.x = slot.x;
        e.mode = "returning";
      }
    }
  }

  // --- Balas del jugador contra enemigos ---
  for (const b of state.bullets) {
    for (const e of state.enemies) {
      if (e.hp > 0 && (e.mode !== "challenge" || e.delay <= 0) && hit(b.x, b.y, e.x, e.y, 20, 14)) {
        e.hp -= 1;
        b.y = -100;
        if (e.hp <= 0) {
          if (e.mode === "challenge") {
            state.challengeHits += 1;
            addScore(state, 100, e.x, e.y);
          } else {
            addScore(state, points(e.kind, e.mode === "diving"), e.x, e.y);
          }
          state.explosions.push({ x: e.x, y: e.y, time: 0, color: enemyColor(e.kind) });
          state.events.push(e.kind === "boss" ? "explode" : "enemyHit");
        } else {
          state.events.push("bossHit");
        }
        break;
      }
    }
  }
  // --- Balas del jugador contra la nave nodriza ---
  if (m) {
    for (const b of state.bullets) {
      if (b.y > 0 && hit(b.x, b.y, m.x, m.y, 55, 28)) {
        b.y = -100;
        m.hp -= 1;
        m.flash = 0.08;
        addScore(state, 10, m.x, m.y);
        state.events.push("bossHit");
      }
    }
    if (m.hp <= 0) {
      const bonus = 5000 * Math.floor(state.level / 5);
      addScore(state, bonus, m.x, m.y - 40);
      for (let i = 0; i < 8; i++) {
        state.explosions.push({
          x: m.x + (Math.random() - 0.5) * 100,
          y: m.y + (Math.random() - 0.5) * 50,
          time: -i * 0.08, // explosiones en cadena
          color: i % 2 ? "#c43bff" : "#ffffff",
        });
      }
      // Al caer la nodriza, sus escoltas explotan también
      for (const e of state.enemies) {
        if (!e.escort) continue;
        e.hp = 0;
        addScore(state, 100, e.x, e.y);
        state.explosions.push({ x: e.x, y: e.y, time: 0, color: enemyColor(e.kind) });
      }
      state.enemyBullets = [];
      state.mothership = null;
      state.events.push("bossDefeat");
    }
  }

  state.bullets = state.bullets.filter((b) => b.y > -10);
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // --- Choques contra el jugador (en el desafío no hay peligro) ---
  if (!challenge && state.playerAlive && state.invulnerable === 0) {
    const shot = state.enemyBullets.find((b) => hit(b.x, b.y, state.playerX, PLAYER_Y, 16, 14));
    const rammer = state.enemies.find((e) => hit(e.x, e.y, state.playerX, PLAYER_Y, 30, 26));
    if (shot || rammer) {
      if (shot) shot.y = HEIGHT + 100;
      if (rammer) {
        rammer.hp = 0;
        addScore(state, points(rammer.kind, true), rammer.x, rammer.y);
        state.explosions.push({ x: rammer.x, y: rammer.y, time: 0, color: enemyColor(rammer.kind) });
        state.enemies = state.enemies.filter((e) => e.hp > 0);
      }
      killPlayer(state);
    }
  }

  // --- ¿Nivel terminado? ---
  if (state.phase === "playing" && state.enemies.length === 0 && !state.mothership) {
    state.phase = "levelclear";
    state.phaseTimer = challenge ? 3.5 : 2.5;
    state.enemyBullets = [];
    state.bullets = [];
    if (challenge) {
      const perfect = state.challengeHits === state.challengeTotal;
      state.challengeBonus = perfect ? 10000 : state.challengeHits * 100;
      addScore(state, state.challengeBonus, WIDTH / 2, HEIGHT / 2);
      state.events.push(perfect ? "perfect" : "levelClear");
    } else {
      state.events.push("levelClear");
    }
    // Si estaba esperando para reaparecer, vuelve para el siguiente nivel
    if (!state.playerAlive && state.lives > 0) {
      state.playerAlive = true;
      state.playerX = WIDTH / 2;
      state.invulnerable = 2;
    }
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

export function draw(ctx: CanvasRenderingContext2D, state: GameState, muted = false) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const s of state.stars) {
    if (Math.random() < 0.03) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 2, 2);
  }

  for (const e of state.enemies) {
    if (e.mode === "challenge" && e.delay > 0) continue;
    drawSprite(ctx, enemySprite(e), e.x, e.y, SCALE);
  }

  const m = state.mothership;
  if (m) {
    drawSprite(ctx, m.flash > 0 ? MOTHERSHIP_FLASH_SPRITE : MOTHERSHIP_SPRITE, m.x, m.y, 5);
    // Barra de vida
    const barW = 260;
    const left = WIDTH / 2 - barW / 2;
    ctx.fillStyle = "#333333";
    ctx.fillRect(left, 52, barW, 8);
    ctx.fillStyle = m.hp < m.maxHp / 2 ? "#ff3b3b" : "#c43bff";
    ctx.fillRect(left, 52, (barW * Math.max(m.hp, 0)) / m.maxHp, 8);
    text(ctx, "NAVE NODRIZA", WIDTH / 2, 74, "#c43bff", 11);
  }

  const showPlayer = state.phase === "playing" || state.phase === "levelclear";
  const blink = state.invulnerable > 0 && Math.floor(state.invulnerable * 10) % 2 === 0;
  if (showPlayer && state.playerAlive && !blink) {
    drawSprite(ctx, PLAYER_SPRITE, state.playerX, PLAYER_Y, SCALE);
  }

  ctx.fillStyle = "#3bf0ff";
  for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 7, 3, 14);
  ctx.fillStyle = "#ff3b3b";
  for (const b of state.enemyBullets) ctx.fillRect(b.x - 2, b.y - 5, 4, 10);

  for (const ex of state.explosions) {
    if (ex.time < 0) continue; // aún no le toca explotar
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

  for (const p of state.popups) {
    ctx.globalAlpha = 1 - p.time / 0.9;
    text(ctx, p.text, p.x, p.y - p.time * 30, "#3bf0ff", 12);
    ctx.globalAlpha = 1;
  }

  // Marcador
  text(ctx, "PUNTOS", 12, 22, "#ff3b3b", 14, "left");
  text(ctx, String(state.score), 12, 40, "#ffffff", 16, "left");
  text(ctx, "RÉCORD", WIDTH / 2, 22, "#ff3b3b", 14);
  text(ctx, String(state.highScore), WIDTH / 2, 40, "#ffffff", 16);
  text(ctx, `NIVEL ${state.level}`, WIDTH - 12, 22, "#3bf0ff", 14, "right");
  text(ctx, muted ? "SIN SONIDO (M)" : "SONIDO (M)", WIDTH - 12, 40, "#888888", 12, "right");

  if (showPlayer) {
    const spare = state.lives - (state.playerAlive ? 1 : 0);
    for (let i = 0; i < Math.min(spare, 8); i++) {
      drawSprite(ctx, PLAYER_SPRITE, 22 + i * 30, HEIGHT - 14, 1.6);
    }
  }

  const challenge = isChallengeLevel(state.level);
  if (state.phase === "playing" && state.levelBanner > 0) {
    if (isBossLevel(state.level)) {
      text(ctx, "¡NAVE NODRIZA!", WIDTH / 2, HEIGHT / 2 - 10, "#c43bff", 30);
      text(ctx, "Esquiva sus disparos en abanico", WIDTH / 2, HEIGHT / 2 + 20, "#ffffff", 14);
    } else if (challenge) {
      text(ctx, "¡FASE DE DESAFÍO!", WIDTH / 2, HEIGHT / 2 - 10, "#ffd23b", 28);
      text(ctx, "Derriba a todos: no te pueden dañar", WIDTH / 2, HEIGHT / 2 + 20, "#ffffff", 14);
    } else {
      text(ctx, `NIVEL ${state.level}`, WIDTH / 2, HEIGHT / 2, "#3bf0ff", 30);
    }
  }

  if (state.phase === "levelclear") {
    if (challenge) {
      const perfect = state.challengeHits === state.challengeTotal;
      text(ctx, perfect ? "¡PERFECTO!" : "DESAFÍO TERMINADO", WIDTH / 2, HEIGHT / 2 - 40, "#ffd23b", 28);
      text(ctx, `Derribados: ${state.challengeHits} / ${state.challengeTotal}`, WIDTH / 2, HEIGHT / 2, "#ffffff", 18);
      text(ctx, `Bonus: ${state.challengeBonus}`, WIDTH / 2, HEIGHT / 2 + 30, "#3bf0ff", 18);
    } else if (isBossLevel(state.level)) {
      text(ctx, "¡NODRIZA DERRIBADA!", WIDTH / 2, HEIGHT / 2 - 10, "#c43bff", 28);
      text(ctx, `Bonus: ${5000 * Math.floor(state.level / 5)}`, WIDTH / 2, HEIGHT / 2 + 25, "#3bf0ff", 18);
    } else {
      text(ctx, `¡NIVEL ${state.level} COMPLETADO!`, WIDTH / 2, HEIGHT / 2, "#3bff6e", 26);
    }
  }

  if (state.phase === "menu") {
    text(ctx, "GALAXIA", WIDTH / 2, 210, "#ffd23b", 48);
    text(ctx, "Pulsa ENTER o toca para jugar", WIDTH / 2, 280, "#ffffff", 16);
    text(ctx, "← → mover   ESPACIO disparar   M sonido", WIDTH / 2, 315, "#3bf0ff", 13);
    drawSprite(ctx, BOSS_SPRITE, WIDTH / 2 - 90, 400, SCALE);
    text(ctx, "150 / 400", WIDTH / 2 - 90, 435, "#ffffff", 12);
    drawSprite(ctx, BUTTERFLY_SPRITE, WIDTH / 2, 400, SCALE);
    text(ctx, "80 / 160", WIDTH / 2, 435, "#ffffff", 12);
    drawSprite(ctx, BEE_SPRITE, WIDTH / 2 + 90, 400, SCALE);
    text(ctx, "50 / 100", WIDTH / 2 + 90, 435, "#ffffff", 12);
    text(ctx, "(en formación / atacando)", WIDTH / 2, 460, "#888888", 12);
    text(ctx, `Vida extra cada ${EXTRA_LIFE_EVERY} puntos`, WIDTH / 2, 500, "#3bff6e", 12);
    text(ctx, "Fase de desafío cada 3 niveles", WIDTH / 2, 520, "#ffd23b", 12);
    text(ctx, "Nave nodriza cada 5 niveles", WIDTH / 2, 540, "#c43bff", 12);
  }

  if (state.phase === "gameover") {
    text(ctx, "GAME OVER", WIDTH / 2, HEIGHT / 2 - 30, "#ff3b3b", 40);
    text(ctx, `Puntos: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 10, "#ffffff", 18);
    text(ctx, `Llegaste al nivel ${state.level}`, WIDTH / 2, HEIGHT / 2 + 36, "#3bf0ff", 14);
    text(ctx, "Pulsa ENTER o toca para reintentar", WIDTH / 2, HEIGHT / 2 + 70, "#ffd23b", 14);
  }
}
