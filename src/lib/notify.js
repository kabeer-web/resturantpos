// Lightweight alert helpers for new incoming orders.
// Uses Web Audio API to generate a two-tone beep (no external mp3 needed),
// plus the browser Notification API so staff get alerted even if the
// BeerFlow tab isn't focused.

export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const beep = (startTime, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };

    const now = ctx.currentTime;
    beep(now, 880);
    beep(now + 0.32, 1174.7);
  } catch (err) {
    console.error('Notification sound failed:', err);
  }
}

export function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

export function notifyBrowser(title, body) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'beerflow-new-order' });
  } catch (err) {
    console.error('Browser notification failed:', err);
  }
}
