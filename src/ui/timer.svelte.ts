// One study timer for the whole app: it keeps counting when the reader closes, until stopped or the app quits.
import {
  elapsed, isDone, newCountdown, newStopwatch, pauseCountdown, pauseWatch, remaining, startCountdown, startWatch,
  type Countdown, type Stopwatch,
} from "../core/timer";

class StudyTimer {
  now = $state(Date.now());
  watch = $state<Stopwatch>(newStopwatch());
  alarm = $state<Countdown | null>(null);
  /** True from the moment the alarm ends until the user closes the notice. */
  ringing = $state(false);
  private tick: ReturnType<typeof setInterval> | null = null;

  get watchMs(): number {
    return elapsed(this.watch, this.now);
  }
  get watchRunning(): boolean {
    return this.watch.startedAt !== null;
  }
  get alarmMs(): number {
    return this.alarm ? remaining(this.alarm, this.now) : 0;
  }
  get alarmRunning(): boolean {
    return this.alarm?.endsAt != null;
  }

  toggleWatch(): void {
    const t = Date.now();
    this.watch = this.watchRunning ? pauseWatch(this.watch, t) : startWatch(this.watch, t);
    this.sync();
  }

  resetWatch(): void {
    this.watch = newStopwatch();
    this.sync();
  }

  startAlarm(minutes: number): void {
    this.ringing = false;
    this.alarm = startCountdown(newCountdown(minutes), Date.now());
    this.sync();
  }

  toggleAlarm(): void {
    if (!this.alarm) return;
    const t = Date.now();
    this.alarm = this.alarmRunning ? pauseCountdown(this.alarm, t) : startCountdown(this.alarm, t);
    this.sync();
  }

  cancelAlarm(): void {
    this.alarm = null;
    this.ringing = false;
    this.sync();
  }

  /** Runs the 4 Hz tick only while something counts. */
  private sync(): void {
    this.now = Date.now();
    const busy = this.watchRunning || this.alarmRunning;
    if (busy && !this.tick) this.tick = setInterval(() => this.onTick(), 250);
    if (!busy && this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }

  private onTick(): void {
    this.now = Date.now();
    if (this.alarm && isDone(this.alarm, this.now)) {
      this.alarm = null;
      this.ringing = true;
      beep();
      this.sync();
    }
  }
}

/** Three short tones; silent if audio is blocked. */
function beep(): void {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.35;
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no audio: the on-screen notice still shows */
  }
  navigator.vibrate?.([200, 100, 200]);
}

export const studyTimer = new StudyTimer();
