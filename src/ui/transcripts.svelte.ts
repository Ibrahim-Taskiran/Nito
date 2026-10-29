// Recordings of the open document and their transcripts. Web Audio conversion lives here;
// WAV encoding, whisper JSON and Markdown rules are in core/transcribe.
import { TranscriptStore } from "../core/transcribe/store";
import { parseWhisperJson, transcriptMarkdown, transcriptTitle } from "../core/transcribe/transcript";
import { WHISPER_SAMPLE_RATE, encodeWav, mixToMono } from "../core/transcribe/wav";
import type { Id, Note, Recording } from "../core/types";
import { canSetupWhisper, canTranscribe, type SetupProgress, type WhisperModel, type WhisperStatus } from "../platform/transcriber";
import type { Reader } from "./reader.svelte";

export interface Job {
  phase: "convert" | "whisper" | "save";
  percent: number;
}

/** Any recording (webm/opus, m4a) -> 16 kHz mono 16-bit WAV bytes. Decoding at 16 kHz resamples too. */
export async function recordingToWav(bytes: Uint8Array): Promise<Uint8Array> {
  const ctx = new OfflineAudioContext(1, 1, WHISPER_SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(bytes.slice().buffer);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  return encodeWav(mixToMono(channels), audio.sampleRate);
}

export class Transcripts {
  recordings = $state<Recording[]>([]);
  /** recordingId -> transcript note. */
  notes = $state.raw(new Map<Id, Note>());
  jobs = $state<Record<Id, Job>>({});
  errors = $state<Record<Id, string>>({});
  status = $state<WhisperStatus | null>(null);
  /** Shown after "Yazıya dök" without whisper. */
  missing = $state(false);
  setupOpen = $state(false);
  setupModel = $state<WhisperModel>("base");
  setupProgress = $state<SetupProgress | null>(null);
  setupError = $state<string | null>(null);
  playingId = $state<Id | null>(null);
  expandedId = $state<Id | null>(null);

  private store: TranscriptStore;
  private player: HTMLAudioElement | null = null;
  private urls = new Map<string, string>();

  constructor(readonly reader: Reader) {
    this.store = new TranscriptStore(reader.lib.platform.db);
  }

  get available(): boolean {
    return canTranscribe(this.reader.lib.platform);
  }

  get canSetup(): boolean {
    return canSetupWhisper(this.reader.lib.platform);
  }

  private get transcriber() {
    return this.reader.lib.platform.transcriber;
  }

  async load(): Promise<void> {
    const docId = this.reader.doc.id;
    const [recordings, ids, notes] = await Promise.all([
      this.reader.lib.repo.listRecordings(docId),
      this.store.noteIds(docId),
      this.reader.lib.repo.listNotes({ documentId: docId }),
    ]);
    const byId = new Map(notes.map((n) => [n.id, n]));
    const map = new Map<Id, Note>();
    for (const [recId, noteId] of ids) {
      const n = byId.get(noteId);
      if (n) map.set(recId, n);
    }
    this.recordings = recordings;
    this.notes = map;
    if (this.transcriber && !this.status) this.status = await this.transcriber.status().catch(() => null);
  }

  /** The model to run: the best installed one. */
  private model(): WhisperModel | null {
    const m = this.status?.models ?? [];
    return m.includes("large-v3-turbo") ? "large-v3-turbo" : m.includes("base") ? "base" : null;
  }

  async transcribe(rec: Recording): Promise<void> {
    if (this.jobs[rec.id]) return;
    delete this.errors[rec.id];
    const t = this.transcriber;
    if (t) this.status = await t.status().catch(() => this.status);
    const model = this.model();
    if (!t || !this.status?.installed || !model) {
      this.missing = true;
      return;
    }
    this.missing = false;
    const wavRel = `transcripts/${rec.id}.wav`;
    this.jobs[rec.id] = { phase: "convert", percent: 0 };
    try {
      const wav = await recordingToWav(await this.reader.lib.platform.storage.read(rec.filePath));
      await this.reader.lib.platform.storage.write(wavRel, wav);
      this.jobs[rec.id] = { phase: "whisper", percent: 0 };
      const json = await t.transcribe(wavRel, model, (p) => {
        if (this.jobs[rec.id]) this.jobs[rec.id].percent = p;
      });
      this.jobs[rec.id] = { phase: "save", percent: 100 };
      await this.store.save(rec, transcriptTitle(rec.startedAt), transcriptMarkdown(parseWhisperJson(json)));
      await this.load();
      this.expandedId = rec.id;
    } catch (e) {
      this.errors[rec.id] = `Yazıya dökülemedi: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      delete this.jobs[rec.id];
      await this.reader.lib.platform.storage.remove(wavRel).catch(() => {});
    }
  }

  async runSetup(): Promise<void> {
    const t = this.transcriber;
    if (!t?.setup || this.setupProgress) return;
    this.setupError = null;
    this.setupProgress = { stage: "binary", received: 0, total: 0 };
    try {
      this.status = await t.setup(this.setupModel, (p) => (this.setupProgress = p));
      this.missing = false;
      this.setupOpen = false;
    } catch (e) {
      this.setupError = `Kurulum tamamlanamadı: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.setupProgress = null;
    }
  }

  /** Plays a recording, optionally from a transcript paragraph; a second call stops it. */
  async play(rec: Recording, at?: number): Promise<void> {
    if (this.playingId === rec.id && at === undefined) {
      this.player?.pause();
      return;
    }
    let url = this.urls.get(rec.filePath);
    if (!url) {
      const bytes = await this.reader.lib.platform.storage.read(rec.filePath);
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: rec.mimeType }));
      this.urls.set(rec.filePath, url);
    }
    this.player ??= new Audio();
    const player = this.player;
    player.onpause = player.onended = () => (this.playingId = null);
    if (player.src !== url) player.src = url;
    if (at !== undefined) player.currentTime = at;
    this.playingId = rec.id;
    try {
      await player.play();
    } catch {
      this.playingId = null;
    }
  }

  dispose(): void {
    this.player?.pause();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
