const midi = (note) => 440 * 2 ** ((note - 69) / 12);

// D minor loop: Dm - C - Bb - A, one bar each.
const PROGRESSION = [
  { root: 50, chord: [0, 3, 7] },
  { root: 48, chord: [0, 4, 7] },
  { root: 46, chord: [0, 4, 7] },
  { root: 45, chord: [0, 4, 7] },
];
const ARP = [0, 1, 2, 1, 2, 3, 2, 1];
const TEMPO = 96;
const EIGHTH = 60 / TEMPO / 2;
const LOOKAHEAD = 0.15;

// Minimum seconds between two plays of the same sound, so rapid fire stays pleasant.
const THROTTLE = { turret: 0.07, ballista: 0.06, cannon: 0.08, catapult: 0.1, frost: 0.1, explosion: 0.06, death: 0.05, coin: 0.05, hit: 0.05 };

/**
 * Procedural audio (Web Audio API, no sound files). Created on the first user
 * gesture to satisfy autoplay rules (iOS, Chrome).
 */
export class AudioEngine {
  constructor({ sound, music }) {
    this.soundOn = sound;
    this.musicOn = music;
    this.ctx = null;
    this.lastPlayed = new Map();
    this.step = 0;
    this.nextNoteTime = 0;
    this.intensity = 0;
    this.schedulerId = 0;
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
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.schedulerId = setInterval(() => this.schedule(), 30);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }

  buildGraph() {
    const ctx = this.ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 5;
    compressor.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.soundOn ? 0.8 : 0;
    this.sfxBus.connect(compressor);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2200;
    this.musicFilter.connect(this.musicBus).connect(compressor);
    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  get ready() {
    return this.ctx?.state === 'running';
  }

  setSound(on) {
    this.soundOn = on;
    this.sfxBus?.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    this.musicBus?.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  /** 0 = calm (menu, between waves), 1 = wave in progress (adds drums, opens filter). */
  setIntensity(value) {
    this.intensity = value;
    this.musicFilter?.frequency.setTargetAtTime(value > 0 ? 5000 : 1800, this.ctx.currentTime, 0.5);
  }

  duck(ducked) {
    this.musicBus?.gain.setTargetAtTime(this.musicOn ? (ducked ? 0.1 : 0.32) : 0, this.ctx.currentTime, 0.2);
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // ------------------------------------------------------------ music

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextNoteTime < ctx.currentTime - 0.2) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += EIGHTH;
      this.step = (this.step + 1) % (PROGRESSION.length * 8);
    }
  }

  playStep(step, time) {
    const bar = PROGRESSION[Math.floor(step / 8)];
    const beat = step % 8;
    const bus = this.musicFilter;
    const tones = [...bar.chord, 12];
    this.tone({ type: 'triangle', freq: midi(bar.root + 24 + tones[ARP[beat]]), start: time, duration: EIGHTH * 1.8, gain: 0.08, attack: 0.005, bus });
    if (beat === 0 || beat === 4) this.tone({ type: 'sine', freq: midi(bar.root), start: time, duration: EIGHTH * 3.5, gain: 0.22, attack: 0.02, bus });
    if (beat === 0) this.tone({ type: 'sawtooth', freq: midi(bar.root + 12 + bar.chord[1]), start: time, duration: EIGHTH * 7, gain: 0.025, attack: 0.3, bus });
    if (this.intensity > 0) {
      if (beat % 4 === 0) this.tone({ type: 'sine', freq: 120, freqEnd: 45, start: time, duration: 0.18, gain: 0.35, attack: 0.002, bus: this.musicBus });
      if (beat % 4 === 2) this.noise({ start: time, duration: 0.09, gain: 0.08, filter: 'bandpass', freq: 2200, bus: this.musicBus });
      this.noise({ start: time, duration: 0.03, gain: 0.025, filter: 'highpass', freq: 8000, bus: this.musicBus });
    }
  }

  // ------------------------------------------------------------ synthesis helpers

  tone({ type, freq, freqEnd, start, duration, gain, attack = 0.01, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (freqEnd) oscillator.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise({ start, duration, gain, filter, freq, freqEnd, q = 1, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(freq, start);
    if (freqEnd) biquad.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(biquad).connect(envelope).connect(bus);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.02);
  }

  /** Returns the current time if the sound may play now, else null. */
  gate(key) {
    if (!this.ready || !this.soundOn) return null;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -1;
    if (now - last < (THROTTLE[key] ?? 0)) return null;
    this.lastPlayed.set(key, now);
    return now;
  }

  // ------------------------------------------------------------ sound effects

  shoot(towerId) {
    const t = this.gate(towerId);
    if (t === null) return;
    switch (towerId) {
      case 'ballista':
        this.tone({ type: 'triangle', freq: 520, freqEnd: 240, start: t, duration: 0.12, gain: 0.16 });
        this.noise({ start: t, duration: 0.05, gain: 0.12, filter: 'highpass', freq: 3000 });
        break;
      case 'cannon':
        this.tone({ type: 'sine', freq: 150, freqEnd: 45, start: t, duration: 0.3, gain: 0.45, attack: 0.003 });
        this.noise({ start: t, duration: 0.25, gain: 0.3, filter: 'lowpass', freq: 1400, freqEnd: 200 });
        break;
      case 'turret':
        this.tone({ type: 'square', freq: 820 + Math.random() * 80, freqEnd: 400, start: t, duration: 0.05, gain: 0.05 });
        this.noise({ start: t, duration: 0.03, gain: 0.08, filter: 'bandpass', freq: 2500 });
        break;
      case 'catapult':
        this.noise({ start: t, duration: 0.35, gain: 0.22, filter: 'bandpass', freq: 500, freqEnd: 160, q: 2 });
        this.tone({ type: 'triangle', freq: 110, freqEnd: 70, start: t, duration: 0.15, gain: 0.25 });
        break;
      case 'frost':
        this.tone({ type: 'sine', freq: 1318, start: t, duration: 0.6, gain: 0.09, attack: 0.005 });
        this.tone({ type: 'sine', freq: 1976, start: t + 0.03, duration: 0.5, gain: 0.06, attack: 0.005 });
        this.noise({ start: t, duration: 0.3, gain: 0.05, filter: 'highpass', freq: 6000 });
        break;
      default:
    }
  }

  explosion(big) {
    const t = this.gate('explosion');
    if (t === null) return;
    this.noise({ start: t, duration: big ? 0.6 : 0.35, gain: big ? 0.45 : 0.28, filter: 'lowpass', freq: 1800, freqEnd: 120 });
    this.tone({ type: 'sine', freq: 100, freqEnd: 35, start: t, duration: big ? 0.5 : 0.3, gain: big ? 0.5 : 0.3, attack: 0.003 });
  }

  enemyDeath(big) {
    const t = this.gate('death');
    if (t === null) return;
    this.tone({ type: 'square', freq: big ? 300 : 700, freqEnd: big ? 60 : 180, start: t, duration: big ? 0.6 : 0.2, gain: 0.08 });
    this.noise({ start: t, duration: big ? 0.8 : 0.2, gain: big ? 0.35 : 0.12, filter: 'lowpass', freq: 3000, freqEnd: 300 });
  }

  coin() {
    const t = this.gate('coin');
    if (t === null) return;
    this.tone({ type: 'sine', freq: 988, start: t, duration: 0.08, gain: 0.07, attack: 0.003 });
    this.tone({ type: 'sine', freq: 1319, start: t + 0.06, duration: 0.14, gain: 0.07, attack: 0.003 });
  }

  build() {
    const t = this.gate('build');
    if (t === null) return;
    this.noise({ start: t, duration: 0.18, gain: 0.3, filter: 'lowpass', freq: 900 });
    this.tone({ type: 'sine', freq: 180, freqEnd: 90, start: t, duration: 0.2, gain: 0.35, attack: 0.003 });
    this.tone({ type: 'triangle', freq: 660, start: t + 0.1, duration: 0.15, gain: 0.08 });
  }

  upgrade() {
    const t = this.gate('upgrade');
    if (t === null) return;
    [0, 4, 7, 12].forEach((step, i) => this.tone({ type: 'triangle', freq: midi(72 + step), start: t + i * 0.06, duration: 0.25, gain: 0.1 }));
  }

  sell() {
    const t = this.gate('sell');
    if (t === null) return;
    [12, 7, 4].forEach((step, i) => this.tone({ type: 'sine', freq: midi(72 + step), start: t + i * 0.05, duration: 0.15, gain: 0.08 }));
  }

  leak() {
    const t = this.gate('leak');
    if (t === null) return;
    this.tone({ type: 'square', freq: 440, start: t, duration: 0.14, gain: 0.08 });
    this.tone({ type: 'square', freq: 330, start: t + 0.15, duration: 0.2, gain: 0.08 });
  }

  waveStart() {
    const t = this.gate('wave');
    if (t === null) return;
    this.tone({ type: 'sawtooth', freq: midi(57), start: t, duration: 0.5, gain: 0.08, attack: 0.05 });
    this.tone({ type: 'sawtooth', freq: midi(64), start: t + 0.18, duration: 0.7, gain: 0.08, attack: 0.05 });
    this.tone({ type: 'sine', freq: midi(45), start: t, duration: 0.9, gain: 0.2, attack: 0.05 });
  }

  waveCleared() {
    const t = this.gate('cleared');
    if (t === null) return;
    [0, 4, 7].forEach((step, i) => this.tone({ type: 'triangle', freq: midi(74 + step), start: t + i * 0.08, duration: 0.3, gain: 0.09 }));
  }

  victory() {
    const t = this.gate('victory');
    if (t === null) return;
    [0, 4, 7, 12, 7, 12, 16].forEach((step, i) => this.tone({ type: 'triangle', freq: midi(67 + step), start: t + i * 0.12, duration: 0.4, gain: 0.12 }));
  }

  defeat() {
    const t = this.gate('defeat');
    if (t === null) return;
    [7, 3, 0, -5].forEach((step, i) => this.tone({ type: 'triangle', freq: midi(62 + step), start: t + i * 0.22, duration: 0.5, gain: 0.12 }));
  }

  meteorFall() {
    const t = this.gate('meteor');
    if (t === null) return;
    this.noise({ start: t, duration: 0.8, gain: 0.25, filter: 'bandpass', freq: 2400, freqEnd: 300, q: 1.5 });
    this.tone({ type: 'sawtooth', freq: 900, freqEnd: 120, start: t, duration: 0.75, gain: 0.05 });
  }

  meteorImpact() {
    const t = this.gate('meteorImpact');
    if (t === null) return;
    this.tone({ type: 'sine', freq: 70, freqEnd: 25, start: t, duration: 1.1, gain: 0.7, attack: 0.003 });
    this.noise({ start: t + 0.05, duration: 1.3, gain: 0.35, filter: 'lowpass', freq: 900, freqEnd: 80 });
  }

  blizzard() {
    const t = this.gate('blizzard');
    if (t === null) return;
    this.noise({ start: t, duration: 1.2, gain: 0.25, filter: 'highpass', freq: 3000, freqEnd: 8000 });
    [0, 3, 7, 12, 15].forEach((step, i) => this.tone({ type: 'sine', freq: midi(84 + step), start: t + i * 0.04, duration: 0.8, gain: 0.05, attack: 0.005 }));
  }

  lightning() {
    const t = this.gate('lightning');
    if (t === null) return;
    this.noise({ start: t, duration: 0.12, gain: 0.5, filter: 'highpass', freq: 1500 });
    this.noise({ start: t + 0.08, duration: 1.2, gain: 0.4, filter: 'lowpass', freq: 600, freqEnd: 60 });
    this.tone({ type: 'square', freq: 1800, freqEnd: 200, start: t, duration: 0.15, gain: 0.06 });
  }

  combo(count) {
    const t = this.gate('combo');
    if (t === null) return;
    [0, 4, 7, 12].slice(0, Math.min(4, count - 1)).forEach((step, i) => this.tone({ type: 'triangle', freq: midi(79 + step), start: t + i * 0.05, duration: 0.2, gain: 0.08 }));
  }

  click() {
    const t = this.gate('click');
    if (t === null) return;
    this.tone({ type: 'sine', freq: 760, start: t, duration: 0.05, gain: 0.07, attack: 0.002 });
  }

  denied() {
    const t = this.gate('denied');
    if (t === null) return;
    this.tone({ type: 'square', freq: 160, start: t, duration: 0.16, gain: 0.07 });
  }

  dispose() {
    clearInterval(this.schedulerId);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
