const AudioContextClass = window.AudioContext || window.webkitAudioContext;

let audioContext = null;

function getAudioContext() {
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(context, { frequency, endFrequency = frequency, duration = 0.055, delay = 0, type = "sine", volume = 0.028 }) {
  const now = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.008, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

function playNavigation(context) {
  tone(context, { frequency: 560, endFrequency: 760, duration: 0.045, type: "sine", volume: 0.024 });
}

function playStock(context) {
  tone(context, { frequency: 235, endFrequency: 175, duration: 0.055, type: "triangle", volume: 0.032 });
  tone(context, { frequency: 980, endFrequency: 720, duration: 0.032, delay: 0.012, type: "sine", volume: 0.015 });
}

function playSales(context) {
  tone(context, { frequency: 880, endFrequency: 1060, duration: 0.07, type: "sine", volume: 0.028 });
  tone(context, { frequency: 1320, endFrequency: 1540, duration: 0.08, delay: 0.025, type: "sine", volume: 0.018 });
}

function playAnalytics(context) {
  tone(context, { frequency: 460, endFrequency: 610, duration: 0.045, type: "triangle", volume: 0.022 });
  tone(context, { frequency: 690, endFrequency: 830, duration: 0.045, delay: 0.04, type: "triangle", volume: 0.018 });
}

function playSettings(context) {
  tone(context, { frequency: 390, endFrequency: 330, duration: 0.05, type: "sine", volume: 0.021 });
  tone(context, { frequency: 610, endFrequency: 560, duration: 0.032, delay: 0.018, type: "sine", volume: 0.012 });
}

function soundGroup(control) {
  if (control.closest(".bottom-nav")) return "navigation";

  const destination = control.dataset?.nav;
  if (destination === "stock") return "stock";
  if (destination === "sales" || destination === "sale") return "sales";
  if (destination === "analytics") return "analytics";
  if (destination === "settings") return "settings";

  if (control.closest("#view-stock, #movement-dialog, #model-dialog, #stock-dialog")) return "stock";
  if (control.closest("#sale-form, #view-sales, #cash-dialog") || control.id === "open-cash-dialog") return "sales";
  if (control.closest("#view-analytics")) return "analytics";
  if (control.closest("#view-settings, #version-history-dialog")) return "settings";
  return null;
}

function isInteractiveControl(target) {
  return target.closest("button, a, select, input[type='checkbox'], input[type='radio'], [role='button']");
}

function onClick(event) {
  const control = isInteractiveControl(event.target);
  if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;

  const group = soundGroup(control);
  if (!group) return;

  const context = getAudioContext();
  if (!context) return;

  if (group === "navigation") playNavigation(context);
  else if (group === "stock") playStock(context);
  else if (group === "sales") playSales(context);
  else if (group === "analytics") playAnalytics(context);
  else if (group === "settings") playSettings(context);
}

document.addEventListener("click", onClick, { capture: true });
