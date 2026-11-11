import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BikeDataAdapter, BikeState } from '../bike/types';
import { assistedSteering, clamp, collectTargets, courseEffortHint, COURSE_END_Z, DEFAULT_CALIBRATION, FlightInputAdapter, initialFlight, stepFlight, type Calibration, type FlightControls } from './flight';
import { createWorld, terrainHeight, type Quality } from './world';
import './game.css';
import { enterFlightFullscreen } from './display';
import { ScreenAwakeController, type AwakeState } from './wake-lock';
type PlayStatus = 'ready' | 'running' | 'paused' | 'finished';
type Mode = 'scenic' | 'arcade';
interface Stats { speed: number; altitude: number; score: number; elapsed: number; fps: number; effortHint: number; target: string; direction: string; }
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function Game({ adapter, state, simulate }: { adapter: BikeDataAdapter; state: BikeState; simulate: () => void }) {
  const workspace = useRef<HTMLElement>(null);
  const [immersive, setImmersive] = useState(false), [displayMessage, setDisplayMessage] = useState('');
  const nativeFullscreen = useRef(false);
  const host = useRef<HTMLDivElement>(null), engine = useRef<{ reset: () => void } | null>(null);
  const controls = useRef<FlightControls>({ steer: 0, pitch: 0 }), keys = useRef(new Set<string>());
  const [status, setStatus] = useState<PlayStatus>('ready'), statusRef = useRef<PlayStatus>('ready');
  const [mode, setMode] = useState<Mode>('scenic'), modeRef = useRef<Mode>('scenic');
  const [quality, setQuality] = useState<Quality>('low');
  const [assisted, setAssisted] = useState(() => { try { return localStorage.getItem('skycycle.steering') !== 'manual'; } catch { return true; } });
  const assistedRef = useRef(assisted);
  useEffect(() => { assistedRef.current = assisted; controls.current.steer = 0; try { localStorage.setItem('skycycle.steering', assisted ? 'assisted' : 'manual'); } catch { /* Optional preference. */ } }, [assisted]);
  const [calibration, setCalibration] = useState<Calibration>(DEFAULT_CALIBRATION), calibrationRef = useRef(calibration);
  const [stats, setStats] = useState<Stats>({ speed: 0, altitude: 45, score: 0, elapsed: 0, fps: 0, effortHint: 1, target: 'First ring ahead', direction: '↑' });
  const [error, setError] = useState(''), [tilt, setTilt] = useState(false), [tiltMessage, setTiltMessage] = useState('');
  const [tiltSupported, setTiltSupported] = useState(false);
  const tiltValue = useRef<FlightControls>({ steer: 0, pitch: 0 }), tiltBaseline = useRef<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [keepAwake, setKeepAwake] = useState(true);
  const [awake, setAwake] = useState<AwakeState>({ kind: 'off', message: 'Keep-awake starts with the ride.' });
  useEffect(() => {
    let mounted = true;
    const controller = new ScreenAwakeController(next => { if (mounted) setAwake(next); });
    if (keepAwake && status === 'running') void controller.start();
    else setAwake({ kind: 'off', message: 'Keep-awake is off while paused or disabled.' });
    return () => { mounted = false; controller.stop(); };
  }, [keepAwake, status]);
  const toggleFullscreen = async () => {
    if (immersive) { setImmersive(false); setDisplayMessage(''); if (document.fullscreenElement === workspace.current) { try { await document.exitFullscreen(); } catch { /* Page mode already exited. */ } } return; }
    setImmersive(true);
    if (workspace.current) { const native = await enterFlightFullscreen(workspace.current); nativeFullscreen.current = native; setDisplayMessage(native ? '' : 'Page expanded. Use Bluefy Full-screen mode to hide its browser bars; landscape gives a wider view.'); }
  };
  useEffect(() => {
    document.body.classList.toggle('skycycle-immersive', immersive);
    return () => { document.body.classList.remove('skycycle-immersive'); };
  }, [immersive]);
  useEffect(() => {
    const changed = () => { if (nativeFullscreen.current && !document.fullscreenElement) { nativeFullscreen.current = false; setImmersive(false); } };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setImmersive(false); setDisplayMessage(''); } };
    document.addEventListener('fullscreenchange', changed); window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', changed); window.removeEventListener('keydown', escape); };
  }, []);
  const changeStatus = (next: PlayStatus) => { statusRef.current = next; setStatus(next); };
  useEffect(() => { calibrationRef.current = calibration; }, [calibration]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { setTiltSupported(typeof DeviceOrientationEvent !== 'undefined'); }, []);
  const source = useRef<FlightInputAdapter | null>(null);
  useEffect(() => { const input = new FlightInputAdapter(adapter); source.current = input; return () => { input.dispose(); }; }, [adapter]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea,summary')) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S', ' '].includes(e.key)) { e.preventDefault(); keys.current.add(e.key.toLowerCase()); }
      if (e.key === ' ' && !e.repeat && (statusRef.current === 'running' || statusRef.current === 'paused')) { e.preventDefault(); changeStatus(statusRef.current === 'running' ? 'paused' : 'running'); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()); };
    const blur = () => { keys.current.clear(); controls.current = { steer: 0, pitch: 0 }; tiltValue.current = { steer: 0, pitch: 0 }; if (statusRef.current === 'running') changeStatus('paused'); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!tilt) return;
    let received = false;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      received = true;
      const angle = (screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0) * Math.PI / 180;
      const x = e.gamma * Math.cos(angle) + e.beta * Math.sin(angle), y = e.beta * Math.cos(angle) - e.gamma * Math.sin(angle);
      if (!tiltBaseline.current) tiltBaseline.current = { x, y };
      tiltValue.current = { steer: clamp((x - tiltBaseline.current.x) / 22, -1, 1), pitch: clamp(-(y - tiltBaseline.current.y) / 20, -1, 1) };
    };
    const orientation = () => { tiltBaseline.current = null; tiltValue.current = { steer: 0, pitch: 0 }; };
    window.addEventListener('deviceorientation', handler); window.addEventListener('orientationchange', orientation);
    const timeout = setTimeout(() => { if (!received) { setTilt(false); setTiltMessage('No orientation data received. Touch and keyboard controls remain available.'); } }, 4000);
    return () => { clearTimeout(timeout); window.removeEventListener('deviceorientation', handler); window.removeEventListener('orientationchange', orientation); tiltValue.current = { steer: 0, pitch: 0 }; };
  }, [tilt]);
  const enableTilt = async () => {
    if (tilt) { setTilt(false); return; }
    if (!window.isSecureContext) { setTiltMessage('Tilt requires HTTPS.'); return; }
    try {
      const Orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
      if (Orientation.requestPermission && await Orientation.requestPermission() !== 'granted') { setTiltMessage('Motion permission denied. Use touch controls.'); return; }
      tiltBaseline.current = null; setTilt(true); setTiltMessage('Tilt enabled. Your current phone position is neutral.');
    } catch { setTiltMessage('Motion access is unavailable. Use touch or keyboard controls.'); }
  };
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance', alpha: false }); }
    catch { setError('3D rendering is unavailable in this browser. Try enabling WebGL or another supported browser. Bike diagnostics remain available.'); return; }
    setError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute('aria-label', 'Three-dimensional flying bicycle in a mountain valley');
    container.appendChild(renderer.domElement);
    const world = createWorld(quality), camera = new THREE.PerspectiveCamera(60, 1, .3, 1700);
    let flight = initialFlight(), score = 0, frame = 0, lastTime = performance.now(), statTime = lastTime, frameCount = 0, accumulator = 0;
    const targetCamera = new THREE.Vector3(), targetLook = new THREE.Vector3(), look = new THREE.Vector3();
    const resetCamera = () => { camera.position.set(flight.x, flight.y + 8, flight.z + 18); look.set(flight.x, flight.y + 3, flight.z - 25); };
    resetCamera();
    engine.current = { reset() { flight = initialFlight(); score = 0; world.resetTargets(); resetCamera(); accumulator = 0; } };
    const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const contextLost = (event: Event) => { event.preventDefault(); changeStatus('paused'); setError('The graphics context was lost. Reload the page or choose another quality setting to restart graphics.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const animate = (timestamp: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(.1, Math.max(0, (timestamp - lastTime) / 1000)); lastTime = timestamp;
      if (document.hidden) return;
      if (statusRef.current === 'running') {
        const k = keys.current, touch = controls.current;
        const input = { steer: clamp(touch.steer + tiltValue.current.steer + (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0), -1, 1), pitch: clamp(touch.pitch + tiltValue.current.pitch + (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0), -1, 1) };
        const effort = source.current?.effort(Date.now(), calibrationRef.current) ?? 0;
        accumulator += dt;
        while (accumulator >= 1 / 60) {
          const prev = { x: flight.x, y: flight.y, z: flight.z };
          stepFlight(flight, { ...input, steer: assistedRef.current ? assistedSteering(flight, world.targets) : input.steer }, effort, 1 / 60, Math.max(4, terrainHeight(flight.x, flight.z) + 4));
          score += collectTargets(prev, flight, world.targets); accumulator -= 1 / 60;
          if (modeRef.current === 'arcade' && (flight.elapsed >= 180 || flight.z < COURSE_END_Z)) { changeStatus('finished'); break; }
          if (flight.z < COURSE_END_Z) { flight.z = 110; flight.x = 0; flight.heading = 0; world.resetTargets(); resetCamera(); }
        }
      } else accumulator = 0;
      world.bike.position.set(flight.x, flight.y, flight.z); world.bike.rotation.set(flight.pitch, -flight.heading, -flight.bank, 'YXZ');
      world.update(flight.elapsed, statusRef.current === 'running' ? flight.thrust : .08, dt);
      targetCamera.set(flight.x - Math.sin(flight.heading) * 18, flight.y + 8, flight.z + Math.cos(flight.heading) * 18);
      targetLook.set(flight.x + Math.sin(flight.heading) * 28, flight.y + 3 + flight.pitch * 14, flight.z - Math.cos(flight.heading) * 28);
      camera.position.lerp(targetCamera, 1 - Math.exp(-dt * 4)); look.lerp(targetLook, 1 - Math.exp(-dt * 4)); camera.lookAt(look);
      renderer.render(world.scene, camera); frameCount++;
      if (timestamp - statTime > 500) {
        const next = world.targets.find(t => !t.hit && t.z < flight.z);
        setStats({ speed: flight.speed * 3.6, altitude: flight.y, score, elapsed: flight.elapsed, fps: Math.round(frameCount * 1000 / (timestamp - statTime)), effortHint: courseEffortHint(flight, next), target: next ? `${next.kind === 'ring' ? 'Ring' : 'Balloon'} · ${Math.round(Math.hypot(next.x - flight.x, next.y - flight.y, next.z - flight.z))} m · ${Math.round(next.y)} m altitude` : 'Follow the valley', direction: next ? next.x - flight.x > 15 ? '↗' : next.x - flight.x < -15 ? '↖' : next.y - flight.y > 8 ? '⇧' : next.y - flight.y < -8 ? '⇩' : '↑' : '↑' });
        frameCount = 0; statTime = timestamp;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', contextLost); world.dispose(); renderer.dispose(); renderer.domElement.remove(); engine.current = null; };
  }, [quality]);
  const launch = () => { engine.current?.reset(); changeStatus('running'); };
  const changeQuality = (next: Quality) => { changeStatus('ready'); setQuality(next); };
  const freshValue = (v: number | undefined, at: number | undefined) => v !== undefined && Date.now() - (at ?? state.sample.timestamp) < 3000 && ['simulated', 'connected'].includes(state.status) ? Math.round(v) : '—';
  const effortUnit = state.sample.watts === undefined && state.sample.cadence !== undefined ? 'RPM' : 'W';
  const suggestedEffort = Math.round((effortUnit === 'RPM' ? calibration.referenceCadence : calibration.referenceWatts) * stats.effortHint / calibration.gain);
  const awakeLabel = awake.kind === 'active' ? 'AWAKE' : awake.kind === 'off' ? 'AWAKE OFF' : awake.kind === 'requesting' ? 'WAKE REQUEST' : 'SLEEP POSSIBLE';
  return <section ref={workspace} className={`flight-workspace ${immersive ? 'immersive' : ''}`}>
    <div className="flight-toolbar"><div><span className="eyebrow">THE OPEN-SKY EXPERIMENT</span><h2>A different kind of headspace.</h2></div><div className="flight-actions"><button className="secondary fullscreen-toggle" onClick={() => void toggleFullscreen()}>{immersive ? 'Exit full screen' : 'Full screen'}</button><button className="secondary steering-switch" aria-pressed={assisted} onClick={() => setAssisted(!assisted)}>{assisted ? 'Auto-steering on' : 'Manual steering'}</button><button className="secondary" onClick={() => { setShowSettings(!showSettings); if (status === 'running') changeStatus('paused'); }}>⚙ Flight settings</button><button className="secondary" onClick={() => { if (status === 'running') changeStatus('paused'); else if (status === 'paused') changeStatus('running'); else launch(); }}>{status === 'running' ? 'Ⅱ Pause' : status === 'paused' ? '▷ Resume' : '↗ Take flight'}</button></div></div>
    <div className="flight-view"><div className="scene-host" ref={host}/>
      <div className="flight-top"><span className="location-tag">↟ THE AMBER VALLEY <small>ORIGINAL WORLD 01</small></span><span className="flight-mode">{mode === 'scenic' ? '∞ SCENIC EXPLORATION' : `ARCADE · ${clock(Math.max(0, 180 - stats.elapsed))} LEFT`}</span></div>
      <div className="flight-hud"><Hud value={Math.round(stats.speed)} unit="KM/H" label="SPEED"/><Hud value={Math.round(stats.altitude)} unit="M" label="ALTITUDE"/><Hud value={stats.score.toString().padStart(4, '0')} label="SCORE"/><Hud value={clock(stats.elapsed)} label="FLIGHT TIME"/></div>
      {status === 'running' && <div className="target-guide"><b>{stats.direction}</b><span>{stats.target}<small>Aim {suggestedEffort} {effortUnit} | {stats.effortHint > 1.025 ? 'Gentle climb' : stats.effortHint < .975 ? 'Gentle dip - keep pedalling' : 'Steady cruise'}</small></span></div>}
      {state.dataWarning && status === 'running' && <div role="alert" className="flight-warning measurement-warning">Bike data rejected. Check the FTMS layout in Bike diagnostics. Thrust is fading.</div>}
      {state.status !== 'simulated' && state.status !== 'connected' && status === 'running' && <div className="flight-warning">Bike disconnected · thrust is fading <button onClick={simulate}>Use simulation</button></div>}
      {(status !== 'running' || error) && <div className="flight-overlay"><div><div className="eyebrow">{status === 'finished' ? 'COURSE COMPLETE' : status === 'paused' ? 'TAKE A BREATHER' : 'YOUR LEGS. YOUR WINGS.'}</div><h2>{error ? 'The skies are on hold.' : status === 'finished' ? 'A ride above the ordinary.' : status === 'paused' ? 'The valley can wait.' : 'Pedal beyond the everyday.'}</h2><p>{error || (status === 'finished' ? `${stats.score} points · ${clock(stats.elapsed)} in the air. Ready for another adventure?` : status === 'paused' ? 'Your flight is paused. Resume when you’re ready.' : 'Follow the river, thread the golden rings, and find your own pace. A comfortable effort is all it takes.')}</p>
        {status === 'ready' && <div className="mode-select"><button className={mode === 'scenic' ? 'active' : ''} onClick={() => setMode('scenic')}>∞ Scenic ride<small>No timer. Just open skies.</small></button><button className={mode === 'arcade' ? 'active' : ''} onClick={() => setMode('arcade')}>◷ Arcade course<small>Three minutes. Chase a score.</small></button></div>}
        {!error && <button className="primary launch-button" onClick={() => status === 'paused' ? changeStatus('running') : launch()}>{status === 'paused' ? 'Resume flight' : status === 'finished' ? 'Fly again' : 'Let’s take flight'} <span>↗</span></button>}
        {state.status !== 'simulated' && state.status !== 'connected' && <button className="secondary" onClick={simulate}>Use simulated bike</button>}
        <small className="control-hint">{assisted ? 'Auto-steering follows the rings. Pedal to gain lift; ease off to descend.' : 'Hold the left or right edge to steer. Pedal for lift; ease off to descend.'}<br/>Touch controls inside the game view. Space to pause.</small>
      </div></div>}
      {status === 'running' && !assisted && <SteeringZones controls={controls}/>}
      {status === 'running' && (awake.kind === 'unavailable' || awake.kind === 'released') && <div className="awake-warning" role="status">{awake.message}</div>}
      {displayMessage && <div role="status" className="display-message">{displayMessage}<button aria-label="Dismiss full-screen tip" onClick={() => setDisplayMessage('')}>Close</button></div>}
      <div className="flight-bottom"><div><span className="source-dot"/>{state.status === 'simulated' ? 'SIMULATED BIKE' : state.status === 'connected' ? 'BLUETOOTH BIKE' : 'NO BIKE DATA'} <b>{freshValue(state.sample.cadence, state.sample.cadenceAt)} <small>RPM</small></b><b>{freshValue(state.sample.watts, state.sample.wattsAt)} <small>W</small></b></div><span title={awake.message}>{awakeLabel} | {stats.fps} FPS · {quality.toUpperCase()}</span></div>
    </div>
    <div className="flight-controls external-controls"><div className="flight-tip"><strong>{assisted ? 'Auto-steering follows the course.' : 'Hold either edge of the game view to steer.'}</strong><p>Pedal to build speed and lift. Ease off to descend.</p></div></div>
    {showSettings && <div className="panel flight-settings"><div className="panel-heading"><h3>Make the flight yours.</h3><button className="text-button" onClick={() => setShowSettings(false)}>Close settings</button></div><p className="muted">Auto-steering guides left and right toward the next target; your effort controls lift, and optional tilt or keyboard input adds pitch. Switch to manual steering above to use edge touch zones, tilt or a keyboard. Reference power is level cruise (default 45 W). Slightly less gives prompt descent; slightly more gives climb, without needing to stop pedalling. Changes affect virtual thrust only. Adjusting quality restarts the flight. Bluetooth setup and simulation RPM/watts are on the diagnostics tab.</p><div className="settings-grid"><label>Comfortable power <strong>{calibration.referenceWatts} W</strong><input type="range" min="30" max="200" step="5" value={calibration.referenceWatts} onChange={e => setCalibration({ ...calibration, referenceWatts: +e.target.value })}/></label><label>Cadence-only reference <strong>{calibration.referenceCadence} RPM</strong><input type="range" min="30" max="100" value={calibration.referenceCadence} onChange={e => setCalibration({ ...calibration, referenceCadence: +e.target.value })}/></label><label>Thrust gain <strong>{calibration.gain.toFixed(2)}×</strong><input type="range" min=".5" max="1.5" step=".05" value={calibration.gain} onChange={e => setCalibration({ ...calibration, gain: +e.target.value })}/></label><label>Visual quality<select value={quality} onChange={e => changeQuality(e.target.value as Quality)}><option value="low">Low · iPhone default</option><option value="medium">Medium</option><option value="high">High · desktop</option></select></label></div><div className="keep-awake-setting"><label><input type="checkbox" checked={keepAwake} onChange={e => setKeepAwake(e.target.checked)}/> Keep screen awake during rides</label><p className="muted" role="status">{awake.message} Requests are released on pause, finish or leaving flight. Browser/system limits still apply.</p></div><div className="tilt-row"><button className="secondary" disabled={!tiltSupported} onClick={enableTilt}>{tilt ? 'Disable tilt controls' : 'Enable optional tilt'}</button>{tilt && <button className="secondary" onClick={() => { tiltBaseline.current = null; }}>Recenter tilt</button>}<button className="secondary" onClick={simulate}>Switch to simulated bike</button><button className="secondary" onClick={() => { engine.current?.reset(); changeStatus('ready'); }}>Reset flight</button></div>{tiltMessage && <p role="status" className="muted">{tiltMessage}</p>}<p className="muted">With measured watts, power drives thrust. Cadence-only devices use RPM. If reported cadence stops or becomes stale, thrust decays even when power remains. Power-only devices rely on power freshness. Physics is an arcade approximation, not a training or aerodynamic model.</p></div>}
  </section>;
}
function Hud({ value, unit, label }: { value: string | number; unit?: string; label: string }) { return <div><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>; }
function SteeringZones({ controls }: { controls: React.RefObject<FlightControls> }) {
  const held = useRef(new Map<number, number>());
  const [active, setActive] = useState<number[]>([]);
  const update = (id: number, direction?: number) => {
    if (direction === undefined) held.current.delete(id); else held.current.set(id, direction);
    const directions = [...held.current.values()];
    controls.current.steer = clamp(directions.reduce((sum, d) => sum + d, 0), -1, 1);
    setActive(directions);
  };
  useEffect(() => {
    const clear = () => { held.current.clear(); controls.current.steer = 0; setActive([]); };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); held.current.clear(); controls.current.steer = 0; };
  }, [controls]);
  return <div className="steering-zones" aria-label="Manual steering touch zones">{[-1, 1].map(direction => <button
    key={direction} className={`steer-zone ${direction < 0 ? 'left' : 'right'} ${active.includes(direction) ? 'is-held' : ''}`}
    aria-label={`Hold to steer ${direction < 0 ? 'left' : 'right'}`}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); update(e.pointerId, direction); }}
    onPointerUp={e => update(e.pointerId)} onPointerCancel={e => update(e.pointerId)} onLostPointerCapture={e => update(e.pointerId)}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); update(direction - 10, direction); } }}
    onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); update(direction - 10); } }}
    onBlur={() => update(direction - 10)}
  ><span aria-hidden="true"><b>{direction < 0 ? '\u2039' : '\u203a'}</b>HOLD {direction < 0 ? 'LEFT' : 'RIGHT'}</span></button>)}</div>;
}
