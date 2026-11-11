import { BaseAdapter } from './types';
export class SimulatedBike extends BaseAdapter {
  private timer?: ReturnType<typeof setInterval>;
  cadence = 80; watts = 45;
  async connect() { if (this.timer) return; this.tick(); this.timer = setInterval(() => this.tick(), 250); }
  private tick() { this.emit({ status: 'simulated', sample: { timestamp: Date.now(), cadence: this.cadence, watts: this.watts } }); }
  set(cadence: number, watts: number) { this.cadence = cadence; this.watts = watts; if (this.timer) this.tick(); }
  disconnect() { clearInterval(this.timer); this.timer = undefined; this.emit({ status: 'disconnected', sample: { timestamp: Date.now(), cadence: 0, watts: 0 } }); }
}
