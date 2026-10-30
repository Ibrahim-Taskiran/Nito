// Lecture recording while a PDF is open. MediaRecorder lives here; timing and MIME rules are in core/recording.
import { RecordingClock, extensionForMime, levelFromSamples, pickRecordingMime } from "../core/recording";
import { LectureRepo } from "../core/lectureRepo";
import type { Id } from "../core/types";
import type { Library } from "./library.svelte";
import { loadPref } from "./playback";

export type RecorderState = "idle" | "recording" | "paused" | "saving";

export class Recorder {
  state = $state<RecorderState>("idle");
  /** Recorded seconds, pauses excluded. */
  elapsed = $state(0);
  /** 0..1 microphone loudness. */
  level = $state(0);
  error = $state<string | null>(null);

  private recordingId: Id | null = null;
  private clock = new RecordingClock();
  private media: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private chunks: Blob[] = [];
  private tick = 0;
  /** Page on screen; each change while recording is stored with its offset (slide–audio sync). */
  private page = 1;
  private lecture: LectureRepo;

  constructor(readonly lib: Library, readonly documentId: Id, private onSaved: () => void) {
    this.lecture = new LectureRepo(lib.repo.db);
  }

  /** Called by the reader whenever the page on screen changes. */
  notePage(page: number): void {
    if (page === this.page) return;
    this.page = page;
    if (this.active) this.savePage();
  }

  private savePage(): void {
    if (this.recordingId === null) return;
    const at = Math.round(this.clock.elapsedMs(performance.now())) / 1000;
    this.lecture.addPageVisit(this.recordingId, this.page, at).catch((e) => console.warn("Sayfa zamanı kaydedilemedi:", e));
  }

  get active(): boolean {
    return this.state === "recording" || this.state === "paused";
  }

  /** Where a highlight made now sits in the recording, or null when not recording. */
  mark(): { recordingId: Id; offsetSeconds: number } | null {
    if (!this.active || this.recordingId === null) return null;
    return { recordingId: this.recordingId, offsetSeconds: this.clock.offsetSeconds(performance.now()) };
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    this.error = null;
    try {
      const clean = loadPref("mic");
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean },
      });
    } catch (e) {
      this.error = e instanceof Error && e.name === "NotAllowedError" ? "Mikrofon izni verilmedi." : "Mikrofon açılamadı.";
      return;
    }
    const mimeType = pickRecordingMime((t) => MediaRecorder.isTypeSupported(t));
    this.media = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    this.recordingId = await this.lib.repo.startRecording(this.documentId, this.media.mimeType || mimeType);
    this.chunks = [];
    this.media.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.media.start(1000);
    this.clock.start(performance.now());
    this.state = "recording";
    this.savePage();

    this.audio = new AudioContext();
    const analyser = this.audio.createAnalyser();
    analyser.fftSize = 512;
    this.audio.createMediaStreamSource(this.stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    this.tick = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      this.level = this.state === "recording" ? levelFromSamples(samples) : 0;
      this.elapsed = this.clock.elapsedMs(performance.now()) / 1000;
    }, 100);
  }

  pause(): void {
    if (this.state !== "recording" || !this.media) return;
    this.media.pause();
    this.clock.pause(performance.now());
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused" || !this.media) return;
    this.media.resume();
    this.clock.resume(performance.now());
    this.state = "recording";
  }

  /** Stops and saves the file. Safe to call when idle. */
  async stop(): Promise<void> {
    const media = this.media;
    if (!this.active || !media || this.recordingId === null) return;
    this.state = "saving";
    this.clock.pause(performance.now());
    await new Promise<void>((resolve) => {
      media.onstop = () => resolve();
      media.stop();
    });
    this.release();
    const id = this.recordingId;
    const mime = media.mimeType;
    const blob = new Blob(this.chunks, { type: mime });
    this.chunks = [];
    try {
      if (!blob.size) throw new Error("Kayıt boş.");
      const rel = `recordings/${id}.${extensionForMime(mime)}`;
      await this.lib.platform.storage.write(rel, new Uint8Array(await blob.arrayBuffer()));
      await this.lib.repo.finishRecording(id, rel, this.clock.elapsedMs(performance.now()) / 1000);
    } catch (e) {
      await this.lib.repo.deleteRecording(id);
      this.error = `Kayıt kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.recordingId = null;
    this.elapsed = 0;
    this.state = "idle";
    this.onSaved();
  }

  private release(): void {
    clearInterval(this.tick);
    this.level = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audio?.close();
    this.stream = null;
    this.audio = null;
    this.media = null;
  }
}
