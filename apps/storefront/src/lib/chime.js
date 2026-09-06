// A short synthesised "ping-ping" for a new chat reply — no audio asset.
// Browsers block audio until the user has interacted with the page; by the
// time a reply arrives the visitor has almost always clicked something.
let ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function burst() {
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.0001;
    master.connect(ac.destination);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.6, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    [
      { f: 1046, t: 0 },
      { f: 1568, t: 0.11 },
    ].forEach(({ f, t }) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = 1;
      osc.connect(g);
      g.connect(master);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    });
  } catch {
    /* silent */
  }
}

export function playChatChime() {
  burst();
  setTimeout(burst, 300);
}
