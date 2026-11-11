/** Short original synthesized cues; no music playback or external audio assets. */
export class HitAudio {
  enabled = false;
  private context?: AudioContext;
  private master?: GainNode;
  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return false;
      if (!this.context || this.context.state === 'closed') {
        this.context = new Audio(); this.master = this.context.createGain();
        this.master.gain.value = .055; this.master.connect(this.context.destination);
      }
      await this.context.resume(); return this.context.state === 'running';
    } catch { return false; }
  }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (this.master) this.master.gain.value = enabled ? .055 : 0; }
  play(kind: 'ring' | 'balloon') {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return;
    const context = this.context;
    const notes = kind === 'ring' ? [784, 1046] : [523, 784, 1318];
    try { notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator(), envelope = context.createGain(), start = context.currentTime + i * .065;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(1, start + .008); envelope.gain.exponentialRampToValueAtTime(.001, start + .14);
      oscillator.connect(envelope); envelope.connect(this.master!); oscillator.start(start); oscillator.stop(start + .15);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }); } catch { /* Audio failure must never prevent scoring or flight. */ }
  }
  dispose() { const context = this.context; this.context = undefined; this.master = undefined; if (context) void context.close().catch(() => {}); }
}
