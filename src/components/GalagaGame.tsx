"use client";
// "use client" le dice a Next.js que este componente corre en el navegador.
// Lo necesitamos porque usamos el teclado, el canvas y animaciones.

import { useEffect, useRef } from "react";
import { HEIGHT, WIDTH, createGame, draw, startGame, update, type Input } from "@/game/engine";

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

export default function GalagaGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // useRef guarda datos que cambian 60 veces por segundo SIN volver a pintar React.
  // Si usáramos useState, React redibujaría todo en cada cuadro y sería lento.
  const input = useRef<Input>({ left: false, right: false, fire: false });
  const game = useRef(createGame());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    game.current.highScore = loadHighScore();

    const startIfIdle = () => {
      if (game.current.phase !== "playing") startGame(game.current);
    };

    // --- Teclado ---
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") input.current.left = down;
      else if (k === "ArrowRight" || k === "d" || k === "D") input.current.right = down;
      else if (k === " " || k === "ArrowUp") input.current.fire = down;
      else if (k === "Enter" && down) startIfIdle();
      else return;
      e.preventDefault(); // evita que la página haga scroll con las flechas/espacio
    };
    const onDown = (e: KeyboardEvent) => setKey(e, true);
    const onUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    canvas.addEventListener("pointerdown", startIfIdle);

    // --- Bucle del juego ---
    // requestAnimationFrame llama a "frame" justo antes de cada repintado de pantalla (~60 veces/seg).
    let last = performance.now();
    let rafId = 0;
    let savedHigh = game.current.highScore;
    const frame = (now: number) => {
      // dt = segundos desde el cuadro anterior. Lo limitamos para que, si cambias
      // de pestaña y vuelves, el juego no "salte" de golpe.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(game.current, dt, input.current);
      draw(ctx, game.current);
      if (game.current.highScore > savedHigh && game.current.phase === "gameover") {
        savedHigh = game.current.highScore;
        saveHighScore(savedHigh);
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    // Limpieza: cuando el componente desaparece, quitamos todo para no dejar basura.
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      canvas.removeEventListener("pointerdown", startIfIdle);
    };
  }, []);

  // Botones táctiles para jugar en el celular
  const hold = (key: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      input.current[key] = true;
      if (game.current.phase !== "playing") startGame(game.current);
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerLeave: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
  });

  const btn =
    "select-none touch-none rounded-full border-2 border-cyan-400 bg-cyan-400/10 text-2xl font-bold text-cyan-300 active:bg-cyan-400/40";

  return (
    <div className="flex w-full max-w-[480px] flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="w-full rounded-lg border-2 border-cyan-500/50 shadow-[0_0_30px_rgba(59,240,255,0.25)] [image-rendering:pixelated]"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      />
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
