// A short two-note "new order" chime, synthesised with the Web Audio API so
// there's no audio asset to ship. Browsers block audio until the user has
// interacted with the page at least once — that's fine here, staff click
// around the admin constantly.
let ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// Shared "play a few notes" helper — each entry is { f: frequency, t: offset }.
function playNotes(notes, { peak = 0.25, tail = 0.7, noteGain = 0.6, noteLen = 0.3, type = 'sine' } = {}) {
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.0001;
    master.connect(ac.destination);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + tail);

    notes.forEach(({ f, t }) => {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = noteGain;
      osc.connect(g);
      g.connect(master);
      osc.start(now + t);
      osc.stop(now + t + noteLen);
    });
  } catch {
    /* audio not available — silent */
  }
}

// New customer order — a bright, upward two-note chime.
export function playChime() {
  playNotes([
    { f: 880, t: 0 },
    { f: 1320, t: 0.14 },
  ]);
}

// Steadfast courier event (delivery status / tracking update) — a single,
// lower, softer note so it reads as distinct from — and less urgent than —
// a new order, even with your eyes off the screen.
export function playCourierChime() {
  playNotes([{ f: 520, t: 0 }], { peak: 0.18, tail: 0.5, noteGain: 0.5, noteLen: 0.4, type: 'triangle' });
}
