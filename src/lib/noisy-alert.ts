// Plays a loud repeating beep using the Web Audio API — no external sound file needed —
// until the driver acknowledges it. Used for "passenger wants to alight / reserve a seat
// / is at the stage" notifications, which are easy to miss as a silent toast while driving.

let audioCtx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;

function beepOnce() {
  audioCtx ??= new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

// Starts beeping every 1.2s. Call stopNoisyAlert() to silence it (e.g. once the driver
// taps "Acknowledge" on the toast, or navigates to the booking).
export function startNoisyAlert() {
  stopNoisyAlert();
  beepOnce();
  loopTimer = setInterval(beepOnce, 1200);
}

export function stopNoisyAlert() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

// Browsers block audio from starting on its own — it can only start from a direct
// user gesture (a tap/click), not from a background event like a realtime alert
// coming in. Call this once when the driver's trip screen mounts: it listens for
// their very first tap anywhere on the page and uses it to create/unlock the
// AudioContext silently (no sound played), so that by the time a real alert fires
// later, the context is already unlocked and startNoisyAlert() can actually be heard.
export function primeAudioOnFirstInteraction() {
  if (audioCtx) return; // already primed
  const unlock = () => {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { once: true });
}
