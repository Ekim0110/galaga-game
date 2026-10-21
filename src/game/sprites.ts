// Dibujos "pixel art" de las naves.
// Cada sprite es una lista de filas; cada letra es un color y "." es transparente.
// Así podemos dibujar naves estilo retro sin necesitar archivos de imagen.

export type Sprite = string[];

export const PALETTE: Record<string, string> = {
  W: "#ffffff", // blanco
  R: "#ff3b3b", // rojo
  B: "#3b8bff", // azul
  Y: "#ffd23b", // amarillo
  G: "#3bff6e", // verde
  P: "#c43bff", // morado
  C: "#3bf0ff", // cian
};

export const PLAYER_SPRITE: Sprite = [
  "......W......",
  "......W......",
  ".....WWW.....",
  ".....WWW.....",
  "..R..WWW..R..",
  "..R.WWWWW.R..",
  "..WWWBWBWWW..",
  ".WWWWWWWWWWW.",
  "WWW.WWWWW.WWW",
  "WW..RR.RR..WW",
  "W...R...R...W",
];

// Abeja (enemigo básico)
export const BEE_SPRITE: Sprite = [
  "...B.....B...",
  "....B...B....",
  "..YYYYYYYYY..",
  ".YRYYRYRYYRY.",
  "YYYYYYYYYYYYY",
  "Y.YYYYYYYYY.Y",
  "Y..B.....B..Y",
  "...B.....B...",
];

// Mariposa (enemigo intermedio)
export const BUTTERFLY_SPRITE: Sprite = [
  "R...........R",
  ".R..BBBBB..R.",
  "..RRBWBWBRR..",
  "RRRRRBBBRRRRR",
  "RR.RRRRRRR.RR",
  "R...RR.RR...R",
  "....R...R....",
];

// Jefe (necesita 2 disparos)
export const BOSS_SPRITE: Sprite = [
  "....G...G....",
  ".....GGG.....",
  "..GGGGGGGGG..",
  ".GGYGGGGGYGG.",
  "GGGGGPPPGGGGG",
  "GG.GPPPPPG.GG",
  "G..GG...GG..G",
  "...G.....G...",
];

// Jefe ya golpeado una vez (cambia de color para que se note)
export const BOSS_HURT_SPRITE: Sprite = BOSS_SPRITE.map((row) =>
  row.replace(/G/g, "P").replace(/Y/g, "C"),
);

// Dibuja un sprite centrado en (x, y). "scale" = tamaño de cada pixel.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale: number,
) {
  const w = sprite[0].length * scale;
  const h = sprite.length * scale;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  for (let r = 0; r < sprite.length; r++) {
    for (let c = 0; c < sprite[r].length; c++) {
      const color = PALETTE[sprite[r][c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + c * scale, top + r * scale, scale, scale);
    }
  }
}
