import type { BikeDataAdapter, BikeState } from '../bike/types';
export default function Game(_props: { adapter: BikeDataAdapter; state: BikeState; simulate: () => void }) { return <div className="panel"><h2>Flight simulation</h2><p>The shared bike interface is ready. The valley simulation is being prepared.</p></div>; }
