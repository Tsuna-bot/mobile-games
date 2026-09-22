const midiToFrequency = (note) => 440 * 2 ** ((note - 69) / 12);

// A minor synthwave loop: Am - F - C - G, one bar each (16 sixteenth notes).
const PROGRESSION = [
  { root: 45, minor: true },
  { root: 41, minor: false },
  { root: 48, minor: false },
  { root: 43, minor: false },
];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 1];
const TEMPO = 112;
const SIXTEENTH = 60 / TEMPO / 4;
const LOOKAHEAD = 0.12;
const MASTER_VOLUME = 0.8;

/**
 * Fully procedural audio (Web Audio API, no files): a small music sequencer
 * and synthesized sound effects. The context is only created on the first
 * user gesture, as required by iOS/Chrome autoplay policies.
 */
export class AudioEngine {
  constructor(enabled) {
    this.enabled = enabled;
    this.ctx = null;
    this.musicMode = 'menu';
    this.step = 0;
    this.nextNoteTime = 0;
    this.schedulerId = 0;
    this.intensity = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        this.ctx = new AudioContextClass();
      } catch {
        return;
      }
      this.buildGraph();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }

  buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER_VOLUME : 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    this.master.connect(compressor).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.musicFilter.Q.value = 2;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicFilter.connect(this.musicBus).connect(this.master);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** 'menu' | 'play' | 'paused' | 'crash' — shapes the music mix. */
  setMusicMode(mode) {
    this.musicMode = mode;
    this.intensity = -1;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const volume = mode === 'paused' ? 0.22 : mode === 'crash' ? 0.3 : 0.55;
    this.musicBus.gain.setTargetAtTime(volume, now, 0.15);
    if (mode === 'crash') this.musicFilter.frequency.setTargetAtTime(280, now, 0.08);
    else if (mode !== 'play') this.musicFilter.frequency.setTargetAtTime(900, now, 0.3);
  }

  /** Opens the music filter as the ship speeds up (0..1). */
  setIntensity(value) {
    if (!this.ctx || this.musicMode !== 'play') return;
    if (Math.abs(value - this.intensity) < 0.02) return;
    this.intensity = value;
    this.musicFilter.frequency.setTargetAtTime(1400 + value * 5200, this.ctx.currentTime, 0.4);
  }

  startMusic() {
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    clearInterval(this.schedulerId);
    this.schedulerId = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextNoteTime < ctx.currentTime - 0.2) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += SIXTEENTH;
      this.step = (this.step + 1) % (PROGRESSION.length * 16);
    }
  }

  playStep(step, time) {
    const chord = PROGRESSION[Math.floor(step / 16)];
    const beatStep = step % 16;
    const third = chord.minor ? 3 : 4;
    const drums = this.musicMode === 'play';

    if (beatStep % 2 === 0) {
      const note = chord.root + (beatStep % 4 === 2 ? 12 : 0);
      this.tone({ type: 'sawtooth', frequency: midiToFrequency(note), start: time, duration: SIXTEENTH * 1.6, gain: 0.16, attack: 0.005, bus: this.musicFilter });
    }
    const interval = [0, third, 7, 12][ARP_PATTERN[beatStep % ARP_PATTERN.length]];
    this.tone({ type: 'triangle', frequency: midiToFrequency(chord.root + 24 + interval), start: time, duration: SIXTEENTH * 0.9, gain: 0.07, attack: 0.004, bus: this.musicFilter });

    if (!drums) return;
    if (beatStep % 4 === 0) {
      this.tone({ type: 'sine', frequency: 150, frequencyEnd: 42, start: time, duration: 0.16, gain: 0.55, attack: 0.002, bus: this.musicBus });
    }
    if (beatStep % 4 === 2) {
      this.noise({ start: time, duration: 0.04, gain: 0.07, filterType: 'highpass', frequency: 7000, bus: this.musicBus });
    }
    if (beatStep === 4 || beatStep === 12) {
      this.noise({ start: time, duration: 0.14, gain: 0.12, filterType: 'bandpass', frequency: 1800, bus: this.musicBus });
    }
  }

  tone({ type, frequency, frequencyEnd, start, duration, gain, attack = 0.01, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (frequencyEnd) oscillator.frequency.exponentialRampToValueAtTime(frequencyEnd, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise({ start, duration, gain, filterType, frequency, frequencyEnd, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    if (frequencyEnd) filter.frequency.exponentialRampToValueAtTime(frequencyEnd, start + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope).connect(bus);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.02);
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  playShard(combo) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const note = 76 + Math.min(combo, 8) * 2;
    this.tone({ type: 'sine', frequency: midiToFrequency(note), start: now, duration: 0.14, gain: 0.2, attack: 0.004 });
    this.tone({ type: 'triangle', frequency: midiToFrequency(note + 7), start: now + 0.05, duration: 0.16, gain: 0.12, attack: 0.004 });
  }

  playNearMiss() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.noise({ start: now, duration: 0.28, gain: 0.35, filterType: 'bandpass', frequency: 700, frequencyEnd: 3800 });
    this.tone({ type: 'square', frequency: 988, start: now + 0.02, duration: 0.09, gain: 0.05 });
  }

  playCrash() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.noise({ start: now, duration: 0.7, gain: 0.7, filterType: 'lowpass', frequency: 2400, frequencyEnd: 120 });
    this.tone({ type: 'sine', frequency: 120, frequencyEnd: 32, start: now, duration: 0.6, gain: 0.7, attack: 0.004 });
    this.tone({ type: 'sawtooth', frequency: 220, frequencyEnd: 55, start: now, duration: 0.35, gain: 0.12 });
  }

  playStart() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.tone({ type: 'sawtooth', frequency: 180, frequencyEnd: 900, start: now, duration: 0.4, gain: 0.1 });
    this.tone({ type: 'sine', frequency: 660, frequencyEnd: 1320, start: now + 0.08, duration: 0.3, gain: 0.1 });
  }

  playClick() {
    if (!this.ready) return;
    this.tone({ type: 'sine', frequency: 740, start: this.ctx.currentTime, duration: 0.06, gain: 0.08, attack: 0.002 });
  }

  playRecord() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((note, i) => {
      this.tone({ type: 'triangle', frequency: midiToFrequency(note), start: now + i * 0.09, duration: 0.3, gain: 0.14 });
    });
  }

  dispose() {
    clearInterval(this.schedulerId);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
