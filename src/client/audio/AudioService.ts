import data from './catalog.json';
export interface AudioSettings { master: number; effects: number; voice: number; muted: boolean; subtitles: boolean }
export interface AudioOptions { dx?: number; dy?: number; tag?: string; duration?: number; rate?: number; gain?: number; pan?: number }
export const AUDIO_STORAGE = 'strike.audio.v1';
export const audioDefaults: AudioSettings = { master: .8, effects: .7, voice: 1, muted: false, subtitles: true };
export function normalizeSettings(value: Partial<AudioSettings>): AudioSettings {
  const settings = { ...audioDefaults };
  for (const key of ['master', 'effects', 'voice'] as const) if (typeof value?.[key] === 'number' && Number.isFinite(value[key])) settings[key] = Math.max(0, Math.min(1, value[key]!));
  for (const key of ['muted', 'subtitles'] as const) if (typeof value?.[key] === 'boolean') settings[key] = value[key]!;
  return settings;
}
export interface AudioAsset { file: string; category: string; volume: number; text?: string; originalText?: string; group?: string }
export const audioCatalog = data as { assets: Record<string, AudioAsset>; weapons: Record<string, { shot: string; reload: string }>; cues: Record<string, string>; voices: Record<string, string[]> };
export function createAudioMixer(ctx: BaseAudioContext) {
  const master = ctx.createGain(), effects = ctx.createGain(), voices = ctx.createGain(), compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8; compressor.knee.value = 6; compressor.ratio.value = 12;
  // Catch synchronized transients during the compressor attack; keep quiet signals linear.
  const ceiling = ctx.createWaveShaper(); ceiling.oversample = '4x';
  ceiling.curve = Float32Array.from({length:2049}, (_,i) => {
    const x=i/1024-1, a=Math.abs(x); return Math.sign(x)*(a<=.7?a:.7+.25*Math.tanh((a-.7)/.25));
  });
  effects.connect(master); voices.connect(master); master.connect(compressor); compressor.connect(ceiling); ceiling.connect(ctx.destination);
  return { master, effects, voices };
}
export class VoiceGate {
  private last = new Map<string, number>();
  accept(group: string, now: number) {
    if (now - (this.last.get(group) ?? -Infinity) < 8000) return false;
    this.last.set(group, now); return true;
  }
}
/** One device context and mixer, shared by all modes; no simulation dependencies. */
export class AudioService {
  settings: AudioSettings = { ...audioDefaults };
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private voices?: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private active = new Set<{ source: AudioBufferSourceNode; voice: boolean; tag?: string }>();
  private gate = new VoiceGate();
  private pendingVoice = false;
  private epoch = 0;
  private tags = new Map<string, number>();
  private suspended = false;
  private foreground = true;
  resumeGeneration = 0;
  private subtitleTimer?: ReturnType<typeof setTimeout>;
  onSubtitle: (text: string) => void = () => {};
  onSettings: () => void = () => {};
  readonly diagnostics = { played: 0, failed: 0, skipped: 0, last: '', recent: [] as string[] };
  constructor() { try { this.settings = normalizeSettings(JSON.parse(localStorage.getItem(AUDIO_STORAGE) ?? '{}')); } catch { /* Storage is optional. */ } }
  get enabled() { return !this.settings.muted; }
  set enabled(value: boolean) { this.configure({ muted: !value }); }
  configure(patch: Partial<AudioSettings>, persist = true) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    if (persist) try { localStorage.setItem(AUDIO_STORAGE, JSON.stringify(this.settings)); } catch { /* Private mode. */ }
    if (this.master) this.master.gain.value = this.settings.muted ? 0 : this.settings.master;
    if (this.effects) this.effects.gain.value = this.settings.effects;
    if (this.voices) this.voices.gain.value = this.settings.voice;
    if (this.settings.muted || !this.settings.master) this.stop();
    if (!this.settings.subtitles) this.onSubtitle('');
    this.onSettings();
  }
  async unlock() {
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        const mixer = createAudioMixer(ctx); this.master = mixer.master; this.effects = mixer.effects; this.voices = mixer.voices;
        this.configure({}, false);
        for (const id of Object.keys(audioCatalog.assets)) void this.load(id);
      }
      if (this.context.state !== 'running' && !document.hidden) await this.context.resume();
    } catch { /* Missing device or blocked autoplay must not break gameplay. */ }
  }
  private load(id: string) {
    if (!this.buffers.has(id)) this.buffers.set(id, (async () => {
      try {
        const response = await fetch(`/assets/audio/${audioCatalog.assets[id].file}`);
        if (!response.ok) throw Error('Audio asset unavailable');
        return await this.context!.decodeAudioData(await response.arrayBuffer());
      } catch { this.diagnostics.failed++; return undefined; }
    })());
    return this.buffers.get(id)!;
  }
  stop(tag?: string) {
    if (tag) this.tags.set(tag, (this.tags.get(tag) ?? 0) + 1);
    if (!tag) { this.epoch++; this.tags.clear(); this.pendingVoice = false; clearTimeout(this.subtitleTimer); this.onSubtitle(''); }
    for (const entry of [...this.active]) if (!tag || entry.tag === tag) { try { entry.source.stop(); } catch { /* Already stopped. */ } this.active.delete(entry); }
  }
  pause(value: boolean) { if (value && !this.suspended) this.stop(); this.suspended = value; }
  setForeground(value: boolean) { if (value !== this.foreground) { this.stop(); this.resumeGeneration++; } this.foreground = value; }
  cue(kind: string, options: AudioOptions = {}) { void this.play(audioCatalog.cues[kind] ?? kind, options); }
  weapon(id: string, action: 'shot' | 'reload', options: AudioOptions = {}) {
    const clip = audioCatalog.weapons[id]?.[action]; if (clip) void this.play(clip, options);
  }
  voice(group: string) {
    if (!this.available() || this.pendingVoice || [...this.active].some(a => a.voice) || !this.settings.voice) return false;
    const clips = audioCatalog.voices[group];
    if (!clips?.length) return false;
    if (!this.gate.accept(group, performance.now())) return true;
    this.pendingVoice = true; const epoch = this.epoch;
    void this.play(clips[Math.floor(Math.random() * clips.length)], {}).finally(() => { if (epoch === this.epoch) this.pendingVoice = false; });
    return true;
  }
  private available() { return this.enabled && this.settings.master > 0 && this.foreground && !this.suspended && typeof document !== 'undefined' && !document.hidden && this.context?.state === 'running'; }
  async play(id: string, options: AudioOptions = {}) {
    const asset = audioCatalog.assets[id]; if (!asset || !this.available()) return;
    const voice = asset.category === 'voice', epoch = this.epoch, tagEpoch = options.tag ? this.tags.get(options.tag) : undefined, started = performance.now();
    if (!(voice ? this.settings.voice : this.settings.effects)) return;
    const buffer = await this.load(id);
    if (!buffer || epoch !== this.epoch || options.tag && tagEpoch !== this.tags.get(options.tag) || !this.available() || performance.now() - started > (voice ? 1500 : 300)) { this.diagnostics.skipped++; return; }
    if (this.active.size >= 32 && !voice) { this.diagnostics.skipped++; return; }
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
    gain.gain.value = asset.volume * Math.max(0, Math.min(1, options.gain ?? 1)) * (voice ? 1 : Math.max(0, 1 - Math.hypot(options.dx ?? 0, options.dy ?? 0) / 1400));
    if (!gain.gain.value) return;
    pan.pan.value = Math.max(-.85, Math.min(.85, options.pan ?? (options.dx ?? 0) / 700)); source.buffer = buffer;
    if (options.rate) source.playbackRate.value = Math.max(.5, Math.min(2, options.rate));
    if (options.duration) source.playbackRate.value = Math.max(.5, Math.min(2, buffer.duration / options.duration));
    source.connect(gain); gain.connect(pan); pan.connect(voice ? this.voices! : this.effects!);
    const entry = { source, voice, tag: options.tag }; this.active.add(entry);
    source.onended = () => { this.active.delete(entry); source.disconnect(); gain.disconnect(); pan.disconnect(); };
    source.start(); if (options.duration) source.stop(ctx.currentTime + options.duration);
    this.diagnostics.played++; this.diagnostics.last = id; this.diagnostics.recent.push(id); if (this.diagnostics.recent.length > 64) this.diagnostics.recent.shift();
    if (voice && asset.text && this.settings.subtitles) {
      this.onSubtitle(asset.text); clearTimeout(this.subtitleTimer);
      this.subtitleTimer = setTimeout(() => this.onSubtitle(''), Math.max(1800, buffer.duration * 1000));
    }
  }
}
export const gameAudio = new AudioService();
