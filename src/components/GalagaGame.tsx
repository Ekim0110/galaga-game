"use client";
// "use client" le dice a Next.js que este componente corre en el navegador.
// Lo necesitamos porque usamos el teclado, el canvas, el audio y animaciones.

import { useEffect, useRef, useState } from "react";
import { HEIGHT, WIDTH, createGame, draw, startGame, update, type Input } from "@/game/engine";
import { isMuted, playSound, toggleMute, unlockAudio } from "@/game/sound";

const HIGH_SCORE_KEY = "galaxia-record";

function loadHighScore() {
  // localStorage guarda el récord en tu navegador. Puede fallar (modo privado), por eso el try/catch.
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value: number) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // si no se puede guardar, el juego sigue funcionando igual
  }
}

// Solo mientras programamos (no en la versión publicada): ?nivel=3 empieza en el nivel 3.
function testStartLevel() {
  if (process.env.NODE_ENV === "production") return 1;
  const n = Number(new URLSearchParams(window.location.search).get("nivel"));
  return n > 0 ? n : 1;
}

export default function GalagaGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // useRef guarda datos que cambian 60 veces por segundo SIN volver a pintar React.
  const input = useRef<Input>({ left: false, right: false, fire: false });
  const game = useRef(createGame());
  // useState sí redibuja React: lo usamos para el icono del botón de sonido.
  const [muted, setMuted] = useState(false);

  const start = () => {
    unlockAudio();
    if (game.current.phase === "menu" || game.current.phase === "gameover") {
      startGame(game.current, testStartLevel());
    }
  };

  const onToggleMute = () => {
    unlockAudio();
    setMuted(toggleMute());
  };

  useEffect(() => {
    setMuted(isMuted());
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    game.current.highScore = loadHighScore();

    // --- Teclado ---
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (down) unlockAudio();
      if (k === "ArrowLeft" || k === "a" || k === "A") input.current.left = down;
      else if (k === "ArrowRight" || k === "d" || k === "D") input.current.right = down;
      else if (k === " " || k === "ArrowUp") input.current.fire = down;
      else if (k === "Enter" && down) start();
      else if ((k === "m" || k === "M") && down) setMuted(toggleMute());
      else return;
      e.preventDefault(); // evita que la página haga scroll con las flechas/espacio
    };
    const onDown = (e: KeyboardEvent) => setKey(e, true);
    const onUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    canvas.addEventListener("pointerdown", start);

    // --- Bucle del juego ---
    let last = performance.now();
    let rafId = 0;
    let savedHigh = game.current.highScore;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(game.current, dt, input.current);

      // El motor deja en "events" los sonidos que quiere; aquí los tocamos y vaciamos la lista.
      for (const ev of game.current.events) playSound(ev);
      game.current.events.length = 0;

      draw(ctx, game.current, isMuted());
      if (game.current.highScore > savedHigh && game.current.phase === "gameover") {
        savedHigh = game.current.highScore;
        saveHighScore(savedHigh);
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      canvas.removeEventListener("pointerdown", start);
    };
  }, []);

  // Botones táctiles para jugar en el celular
  const hold = (key: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      input.current[key] = true;
      start();
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerLeave: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
  });

  const btn =
    "select-none touch-none rounded-full border-2 border-cyan-400 bg-cyan-400/10 text-2xl font-bold text-cyan-300 active:bg-cyan-400/40";

  return (
    <div className="flex w-full max-w-[480px] flex-col items-center gap-4">
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="w-full rounded-lg border-2 border-cyan-500/50 shadow-[0_0_30px_rgba(59,240,255,0.25)] [image-rendering:pixelated]"
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        />
        {/* Botón de sonido: se ve en celular, donde no hay tecla M */}
        <button
          onClick={onToggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-lg [@media(hover:hover)]:hidden"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      {/* Solo se ven en pantallas táctiles (celulares/tablets) */}
      <div className="flex w-full items-center justify-between gap-4 [@media(hover:hover)]:hidden">
        <div className="flex gap-3">
          <button aria-label="Izquierda" className={`${btn} h-16 w-16`} {...hold("left")}>
            ◀
          </button>
          <button aria-label="Derecha" className={`${btn} h-16 w-16`} {...hold("right")}>
            ▶
          </button>
        </div>
        <button aria-label="Disparar" className={`${btn} h-20 w-20 border-red-400 text-red-300`} {...hold("fire")}>
          ●
        </button>
      </div>
    </div>
  );
}
