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
