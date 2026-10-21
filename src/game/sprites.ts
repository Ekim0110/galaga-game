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

// Nave nodriza (jefe grande que aparece cada 5 niveles)
export const MOTHERSHIP_SPRITE: Sprite = [
  ".......PPPPPPP.......",
  ".....PPWWWWWWWPP.....",
  "....PWWCCWWWCCWWP....",
  "...PPPPPPPPPPPPPPP...",
  "..PPRRPPYYYYYPPRRPP..",
  ".PPPPPPPPPPPPPPPPPPP.",
  "PPGGPPGGPPPPPGGPPGGPP",
  "PPPPPPPPPPPPPPPPPPPPP",
  ".PP.RR.PP.R.PP.RR.PP.",
  "..P..R..P...P..R..P..",
  ".....R.........R.....",
];

// Versión blanca de la nodriza: parpadea así cuando recibe un disparo
export const MOTHERSHIP_FLASH_SPRITE: Sprite = MOTHERSHIP_SPRITE.map((row) => row.replace(/[A-Z]/g, "W"));

// Guardamos cada sprite ya dibujado en un "canvas" pequeño y escondido.
// Así, en cada cuadro solo copiamos una imagen (drawImage) en vez de pintar
// cientos de cuadritos uno por uno. Esto hace el juego mucho más fluido,
// sobre todo en celulares.
const cache = new Map<Sprite, Map<number, HTMLCanvasElement>>();

function prerender(sprite: Sprite, scale: number) {
  let byScale = cache.get(sprite);
  if (!byScale) {
    byScale = new Map();
    cache.set(sprite, byScale);
  }
  let img = byScale.get(scale);
  if (!img) {
    img = document.createElement("canvas");
    img.width = Math.ceil(sprite[0].length * scale);
    img.height = Math.ceil(sprite.length * scale);
    const c = img.getContext("2d")!;
    for (let r = 0; r < sprite.length; r++) {
      for (let col = 0; col < sprite[r].length; col++) {
        const color = PALETTE[sprite[r][col]];
        if (!color) continue;
        c.fillStyle = color;
        c.fillRect(col * scale, r * scale, scale, scale);
      }
    }
    byScale.set(scale, img);
  }
  return img;
}

// Dibuja un sprite centrado en (x, y). "scale" = tamaño de cada pixel.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale: number,
) {
  const img = prerender(sprite, scale);
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
}
