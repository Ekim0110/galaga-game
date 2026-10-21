import GalagaGame from "@/components/GalagaGame";

// Página principal: solo muestra el título y el juego.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-4 text-white">
      <h1 className="font-mono text-2xl font-bold tracking-widest text-yellow-300">GALAXIA</h1>
      <GalagaGame />
      <p className="hidden text-center font-mono text-xs text-gray-400 [@media(hover:hover)]:block">
        ← → o A / D para mover · ESPACIO para disparar · ENTER para empezar · M para el sonido
      </p>
    </main>
  );
}
