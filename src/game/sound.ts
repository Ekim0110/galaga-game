// Sonidos del juego, creados con la "Web Audio API" del navegador.
// En vez de usar archivos .mp3, fabricamos los sonidos con osciladores
// (como un sintetizador). Ventajas: no hay que descargar nada y suenan "retro".

export type SoundEvent =
  | "shoot"
  | "enemyHit"
  | "bossHit"
  | "explode"
  | "dive"
  | "playerDie"
  | "levelStart"
  | "levelClear"
  | "challengeStart"
  | "perfect"
  | "extraLife"
  | "gameOver";

const MUTE_KEY = "galaxia-silencio";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = loadMuted();

function loadMuted() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

// Los navegadores solo dejan sonar audio después de que el usuario
// toca o pulsa una tecla. Por eso creamos el AudioContext en ese momento.
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // no pasa nada si no se puede guardar
  }
  return muted;
}

// Un "tono": una onda que va de una frecuencia a otra y se apaga.
function tone(
  type: OscillatorType,
  from: number,
  to: number,
  duration: number,
  volume = 0.5,
  delay = 0,
) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// "Ruido": sonido aleatorio, perfecto para explosiones.
function noise(duration: number, volume = 0.5, cutoff = 1200) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

// Melodía corta: lista de [frecuencia, duración]
function melody(notes: [number, number][], type: OscillatorType = "square", volume = 0.25) {
  let delay = 0;
  for (const [freq, dur] of notes) {
    if (freq > 0) tone(type, freq, freq, dur * 0.95, volume, delay);
    delay += dur;
  }
}

// Notas musicales (en Hz) que usamos en las melodías
const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568 };

export function playSound(event: SoundEvent) {
  if (!ctx || muted) return;
  switch (event) {
    case "shoot":
      tone("square", 1400, 300, 0.12, 0.18);
      break;
    case "enemyHit":
      tone("square", 600, 120, 0.15, 0.3);
      noise(0.2, 0.3, 2000);
      break;
    case "bossHit":
      tone("triangle", 300, 600, 0.12, 0.4);
      break;
    case "explode":
      noise(0.35, 0.45, 1500);
      tone("sawtooth", 200, 40, 0.3, 0.2);
      break;
    case "dive":
      tone("sine", 900, 250, 0.6, 0.12);
      break;
    case "playerDie":
      noise(1, 0.6, 2500);
      tone("sawtooth", 400, 30, 1, 0.3);
      break;
    case "levelStart":
      melody([[N.C5, 0.12], [N.E5, 0.12], [N.G5, 0.12], [N.C6, 0.3]]);
      break;
    case "challengeStart":
      melody([[N.G5, 0.1], [N.G5, 0.1], [N.A5, 0.1], [N.B5, 0.1], [N.C6, 0.1], [N.E6, 0.3]]);
      break;
    case "levelClear":
      melody([[N.E5, 0.1], [N.G5, 0.1], [N.C6, 0.1], [0, 0.05], [N.G5, 0.1], [N.C6, 0.35]], "triangle", 0.35);
      break;
    case "perfect":
      melody([[N.C6, 0.08], [N.E6, 0.08], [N.G6, 0.08], [N.C6, 0.08], [N.E6, 0.08], [N.G6, 0.4]]);
      break;
    case "extraLife":
      melody([[N.A5, 0.08], [N.C6, 0.08], [N.E6, 0.25]], "triangle", 0.35);
      break;
    case "gameOver":
      melody([[N.G5, 0.25], [N.E5, 0.25], [N.D5, 0.25], [N.C5, 0.6]], "triangle", 0.35);
      break;
  }
}
