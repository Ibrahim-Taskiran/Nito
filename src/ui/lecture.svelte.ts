// Lecture audio for the open document: one player shared by the recording list, page chips and note replay.
// Timeline, silence, cue and transcript rules are pure in core/lecture; Web Audio lives here.
import {
  findCues, findSilences, hiddenDuringReplay, pageAt, pageSegments, paragraphPages, rmsFrames, skipTarget,
  type Cue, type PagedParagraph, type PageSegment, type PageVisit, type Span,
} from "../core/lecture";
import { LectureRepo, type StrokeMark } from "../core/lectureRepo";
import { TranscriptStore } from "../core/transcribe/store";
import { transcriptParagraphs } from "../core/transcribe/transcript";
import { mixToMono } from "../core/transcribe/wav";
import type { Id, Note, Recording } from "../core/types";
import { loadPref, loadRate, savePref, saveRate, type AudioPref } from "./playback";
import type { Reader } from "./reader.svelte";

export interface PageCue extends Cue {
  page: number | null;
}

/** Decodes at a low rate: loudness needs no more, and an hour stays under ~60 MB. */
async function silencesOf(bytes: Uint8Array): Promise<Span[]> {
  let audio: AudioBuffer;
  try {
    audio = await new OfflineAudioContext(1, 1, 4000).decodeAudioData(bytes.slice().buffer);
  } catch {
    audio = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes.slice().buffer);
  }
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  return findSilences(rmsFrames(mixToMono(channels), audio.sampleRate, 0.1), 0.1);
}

export class Lecture {
  recordings = $state<Recording[]>([]);
  /** recordingId -> transcript note. */
  notes = $state.raw(new Map<Id, Note>());
  visits = $state.raw(new Map<Id, PageVisit[]>());
  strokeMarks = $state.raw(new Map<Id, StrokeMark>());
  /** recordingId -> silent spans (analysed once, cached in the database). */
  silences = $state.raw(new Map<Id, Span[]>());
  analysing = $state<Id | null>(null);

  playingId = $state<Id | null>(null);
  /** Recording loaded in the player (stays set while paused), with its position. */
  activeId = $state<Id | null>(null);
  position = $state(0);
  duration = $state(0);
  rate = $state(loadRate());
  replayNotes = $state(loadPref("replayNotes"));
  skipSilence = $state(loadPref("skipSilence"));
  denoise = $state(loadPref("denoise"));
  /** Noise and echo cancelling for new recordings. */
  micClean = $state(loadPref("mic"));

  /** recordingId -> page timeline. */
  readonly timelines = $derived.by(() => new Map(this.recordings.map((r) => [r.id, pageSegments(this.visits.get(r.id) ?? [], r.durationSeconds)])));
  /** recordingId -> transcript paragraphs with their pages. */
  readonly paragraphs = $derived.by(() => {
    const out = new Map<Id, PagedParagraph[]>();
    for (const r of this.recordings) {
      const n = this.notes.get(r.id);
      if (n) out.set(r.id, paragraphPages(transcriptParagraphs(n.body), this.timelines.get(r.id) ?? [], r.durationSeconds));
    }
    return out;
  });
  /** recordingId -> spoken cues with the page on screen at that moment. */
  readonly cues = $derived.by(() => {
    const out = new Map<Id, PageCue[]>();
    for (const [id, paras] of this.paragraphs) {
      const seg = this.timelines.get(id) ?? [];
      out.set(id, findCues(paras).map((c) => ({ ...c, page: pageAt(seg, c.at) })));
    }
    return out;
  });

  private repo: LectureRepo;
  private store: TranscriptStore;
  private player: HTMLAudioElement | null = null;
  private urls = new Map<string, string>();
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private chain: AudioNode[] = [];

  constructor(readonly reader: Reader) {
    this.repo = new LectureRepo(reader.lib.repo.db);
    this.store = new TranscriptStore(reader.lib.platform.db);
  }

  async load(): Promise<void> {
    const docId = this.reader.doc.id;
    const [recordings, ids, notes, visits, strokeMarks] = await Promise.all([
      this.reader.lib.repo.listRecordings(docId),
      this.store.noteIds(docId),
      this.reader.lib.repo.listNotes({ documentId: docId }),
      this.repo.pageVisits(docId),
      this.repo.strokeMarks(docId),
    ]);
    const byId = new Map(notes.map((n) => [n.id, n]));
    const map = new Map<Id, Note>();
    for (const [recId, noteId] of ids) {
      const n = byId.get(noteId);
      if (n) map.set(recId, n);
    }
    this.recordings = recordings;
    this.notes = map;
    this.visits = visits;
    this.strokeMarks = strokeMarks;
  }

  get active(): Recording | null {
    return this.recordings.find((r) => r.id === this.activeId) ?? null;
  }

  /** The recording that explains `page`: the one in the player if it does, else the newest that does. */
  recordingFor(page: number): { rec: Recording; segment: PageSegment } | null {
    const order = [...this.recordings].reverse().sort((a, b) => Number(b.id === this.activeId) - Number(a.id === this.activeId));
    for (const rec of order) {
      const segment = this.timelines.get(rec.id)?.find((s) => s.page === page);
      if (segment) return { rec, segment };
    }
    return null;
  }

  /** Cues the lecturer said while `page` was on screen. */
  pageCues(page: number): { rec: Recording; cues: PageCue[] } | null {
    const hit = this.recordingFor(page);
    if (!hit) return null;
    const cues = (this.cues.get(hit.rec.id) ?? []).filter((c) => c.page === page);
    return cues.length ? { rec: hit.rec, cues } : null;
  }

  /** Transcript paragraphs spoken while `page` was on screen. */
  pageSnippets(page: number): { rec: Recording; paragraphs: PagedParagraph[] } | null {
    const hit = this.recordingFor(page);
    if (!hit) return null;
    const paragraphs = (this.paragraphs.get(hit.rec.id) ?? []).filter((p) => p.pages.includes(page));
    return paragraphs.length ? { rec: hit.rec, paragraphs } : null;
  }

  /** Note replay: true while a note made during the playing recording is still ahead of the playhead. */
  hidesAnnotation(id: Id): boolean {
    return this.replayNotes && hiddenDuringReplay(this.reader.marks.get(id), this.activeId, this.position);
  }

  hidesStroke(id: Id): boolean {
    return this.replayNotes && hiddenDuringReplay(this.strokeMarks.get(id), this.activeId, this.position);
  }

  async markStroke(strokeId: Id, recordingId: Id, offsetSeconds: number): Promise<void> {
    await this.repo.markStroke(strokeId, recordingId, offsetSeconds);
    this.strokeMarks = new Map(this.strokeMarks).set(strokeId, { recordingId, offsetSeconds });
  }

  /** Plays a recording, optionally from `at` seconds; without `at`, a second call pauses it. */
  async play(rec: Recording, at?: number): Promise<void> {
    if (this.playingId === rec.id && at === undefined) {
      this.player?.pause();
      return;
    }
    this.reader.pauseMark();
    let url = this.urls.get(rec.filePath);
    if (!url) {
      const bytes = await this.reader.lib.platform.storage.read(rec.filePath);
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: rec.mimeType }));
      this.urls.set(rec.filePath, url);
    }
    const player = (this.player ??= this.newPlayer());
    if (player.src !== url) {
      player.src = url;
      this.position = 0;
      this.duration = rec.durationSeconds;
    }
    player.playbackRate = this.rate;
    player.preservesPitch = true;
    if (at !== undefined) {
      player.currentTime = at;
      this.position = at;
    }
    this.activeId = rec.id;
    this.playingId = rec.id;
    if (this.denoise) this.route();
    if (this.skipSilence) void this.analyse(rec);
    try {
      await this.ctx?.resume();
      await player.play();
    } catch {
      this.playingId = null;
    }
  }

  private newPlayer(): HTMLAudioElement {
    const player = new Audio();
    player.onpause = player.onended = () => (this.playingId = null);
    player.ontimeupdate = () => {
      this.position = player.currentTime;
      const target = this.skipSilence && this.activeId !== null ? skipTarget(this.silences.get(this.activeId) ?? [], player.currentTime) : null;
      if (target !== null) {
        player.currentTime = target;
        this.position = target;
      }
    };
    player.onloadedmetadata = player.ondurationchange = () =>
      (this.duration = Number.isFinite(player.duration) ? player.duration : (this.active?.durationSeconds ?? 0));
    return player;
  }

  pause(): void {
    this.player?.pause();
  }

  setRate(r: number): void {
    this.rate = r;
    saveRate(r);
    if (this.player) this.player.playbackRate = r;
  }

  seek(seconds: number): void {
    if (!this.player) return;
    this.player.currentTime = Math.min(Math.max(0, seconds), this.duration || seconds);
    this.position = this.player.currentTime;
  }

  skip(delta: number): void {
    if (this.player) this.seek(this.player.currentTime + delta);
  }

  setPref(p: AudioPref, on: boolean): void {
    savePref(p, on);
    if (p === "replayNotes") this.replayNotes = on;
    else if (p === "mic") this.micClean = on;
    else if (p === "skipSilence") {
      this.skipSilence = on;
      const rec = this.active;
      if (on && rec) void this.analyse(rec);
    } else {
      this.denoise = on;
      if (on || this.ctx) this.route();
    }
  }

  /** Finds silent spans once per recording; the result is cached in the database. */
  async analyse(rec: Recording): Promise<void> {
    if (this.silences.has(rec.id) || this.analysing === rec.id) return;
    this.analysing = rec.id;
    try {
      let spans = await this.repo.silences(rec.id);
      if (!spans) {
        spans = await silencesOf(await this.reader.lib.platform.storage.read(rec.filePath));
        await this.repo.saveSilences(rec.id, spans);
      }
      this.silences = new Map(this.silences).set(rec.id, spans);
    } catch (e) {
      console.warn("Sessizlik bulunamadı:", e);
      this.silences = new Map(this.silences).set(rec.id, []);
    } finally {
      this.analysing = null;
    }
  }

  /**
   * "Gürültü azalt": a gentle chain (rumble cut, hiss cut, soft compression) through Web Audio.
   * Once the element feeds the AudioContext it always does, so "off" is a direct connection.
   */
  private route(): void {
    const player = this.player;
    if (!player) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaElementSource(player);
      const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 90, Q: 0.7 });
      const presence = new BiquadFilterNode(this.ctx, { type: "peaking", frequency: 2500, Q: 1, gain: 2 });
      const lp = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: 7000, Q: 0.7 });
      const comp = new DynamicsCompressorNode(this.ctx, { threshold: -30, knee: 20, ratio: 3, attack: 0.01, release: 0.25 });
      hp.connect(presence).connect(lp).connect(comp).connect(this.ctx.destination);
      this.chain = [hp, presence, lp, comp];
    }
    const src = this.source!;
    src.disconnect();
    src.connect(this.denoise ? this.chain[0] : this.ctx.destination);
  }

  /** Stops playback if `rec` is loaded and frees its file URL (before deleting it). */
  unload(rec: Recording): void {
    if (this.activeId === rec.id) {
      this.player?.pause();
      this.player?.removeAttribute("src");
      this.activeId = null;
    }
    const url = this.urls.get(rec.filePath);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(rec.filePath);
  }

  dispose(): void {
    this.player?.pause();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}
