export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'simulated' | 'error';
export interface BikeSample { timestamp: number; cadence?: number; watts?: number; speedKph?: number; cadenceAt?: number; wattsAt?: number; }
export interface BikeState { status: ConnectionStatus; sample: BikeSample; error?: string; errorDetail?: string; notice?: string; dataWarning?: string; }
/** Adapters own transport and parsing. Renderers only consume snapshots. No resistance control. */
export interface BikeDataAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(listener: (state: BikeState) => void): () => void;
  getState(): BikeState;
}
export abstract class BaseAdapter implements BikeDataAdapter {
  protected state: BikeState = { status: 'disconnected', sample: { timestamp: 0 } };
  private listeners = new Set<(state: BikeState) => void>();
  getState = () => this.state;
  subscribe = (listener: (state: BikeState) => void) => { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; };
  protected emit(state: BikeState) { this.state = state; this.listeners.forEach(fn => fn(state)); }
  abstract connect(): Promise<void>;
  abstract disconnect(): void;
}
