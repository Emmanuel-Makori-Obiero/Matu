// Plays a loud repeating alert using the Web Audio API — no external sound file needed —
// until the driver acknowledges it. Used for "passenger wants to alight / reserve a seat
// / is at the stage" notifications, which are easy to miss as a silent toast while driving.
//
// Drivers can pick their preferred alert sound from a few presets (frequency/pattern
// combos synthesized live, so there's nothing to upload or host) and test it from
// account settings — tapping "Test sound" is also a reliable way to unlock the
// AudioContext, since browsers only allow audio playback to start from a direct
// user gesture.

export type SoundProfileId = "classic" | "chime" | "alarm" | "double";

type SoundProfile = {
  id: SoundProfileId;
  label: string;
  description: string;
  // A "pattern" is a sequence of (frequency Hz, duration ms) beeps played back-to-back
  // for one alert cycle, then repeated on an interval by startNoisyAlert.
  pattern: { freq: number; durationMs: number; gapMs: number }[];
  type: OscillatorType;
  repeatEveryMs: number;
};

export const SOUND_PROFILES: SoundProfile[] = [
  {
    id: "classic",
    label: "Classic beep",
    description: "A single sharp beep, repeating.",
    pattern: [{ freq: 880, durationMs: 350, gapMs: 0 }],
    type: "square",
    repeatEveryMs: 1200,
  },
  {
    id: "double",
    label: "Double beep",
    description: "Two quick beeps, easier to distinguish from other app sounds.",
    pattern: [
      { freq: 880, durationMs: 180, gapMs: 120 },
      { freq: 880, durationMs: 180, gapMs: 0 },
    ],
    type: "square",
    repeatEveryMs: 1400,
  },
  {
    id: "chime",
    label: "Chime",
    description: "A softer two-tone chime.",
    pattern: [
      { freq: 660, durationMs: 220, gapMs: 40 },
      { freq: 990, durationMs: 260, gapMs: 0 },
    ],
    type: "sine",
    repeatEveryMs: 1600,
  },
  {
    id: "alarm",
    label: "Urgent alarm",
    description: "Loud alternating tone — hardest to miss.",
    pattern: [
      { freq: 700, durationMs: 150, gapMs: 60 },
      { freq: 1000, durationMs: 150, gapMs: 60 },
    ],
    type: "sawtooth",
    repeatEveryMs: 900,
  },
];

const STORAGE_KEY = "matu-alert-sound";
const DEFAULT_SOUND_ID: SoundProfileId = "classic";

export function getSelectedSoundId(): SoundProfileId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as SoundProfileId | null;
    if (stored && SOUND_PROFILES.some((p) => p.id === stored)) return stored;
  } catch {
    // localStorage unavailable (e.g. private mode edge case) — fall back to default.
  }
  return DEFAULT_SOUND_ID;
}

export function setSelectedSoundId(id: SoundProfileId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore write failures — the choice just won't persist across sessions.
  }
}

function getProfile(id: SoundProfileId): SoundProfile {
  return SOUND_PROFILES.find((p) => p.id === id) ?? SOUND_PROFILES[0];
}

let audioCtx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;

function playPattern(profile: SoundProfile) {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  let t = audioCtx.currentTime;
  profile.pattern.forEach(({ freq, durationMs, gapMs }) => {
    const ctx = audioCtx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = profile.type;
    osc.frequency.value = freq;
    const dur = durationMs / 1000;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + Math.min(0.02, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + gapMs / 1000;
  });
}

// Starts repeating the driver's chosen alert sound until stopNoisyAlert() is called
// (e.g. once they tap "Acknowledge" on the toast, or navigate away from the trip screen).
export function startNoisyAlert() {
  stopNoisyAlert();
  const profile = getProfile(getSelectedSoundId());
  playPattern(profile);
  loopTimer = setInterval(() => playPattern(profile), profile.repeatEveryMs);
}

export function stopNoisyAlert() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

// Plays the given (or currently selected) sound exactly once — used by the "Test sound"
// button in account settings. Since this only ever runs from a direct button tap, it
// doubles as a reliable AudioContext unlock, which is more dependable than waiting for
// an arbitrary first tap anywhere on the page.
export function testSound(id?: SoundProfileId) {
  playPattern(getProfile(id ?? getSelectedSoundId()));
}

// Browsers block audio from starting on its own — it can only start from a direct
// user gesture (a tap/click), not from a background event like a realtime alert
// coming in. Call this once when the driver's trip screen mounts: it listens for
// their very first tap anywhere on the page and uses it to create/unlock the
// AudioContext silently (no sound played), so that by the time a real alert fires
// later, the context is already unlocked and startNoisyAlert() can actually be heard.
// This is a best-effort fallback — encourage drivers to use "Test sound" in settings
// at least once too, since that's a guaranteed unlock rather than a hopeful one.
export function primeAudioOnFirstInteraction() {
  if (audioCtx) return; // already primed
  const unlock = () => {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { once: true });
}
