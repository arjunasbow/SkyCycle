import { BUILD_INFO } from '../build-info';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BikeDataAdapter, BikeState } from '../bike/types';
import { assistedSteering, clamp, collectTargets, courseEffortHint, DEFAULT_RIDE_SECONDS, DEFAULT_CALIBRATION, FlightInputAdapter, initialFlight, stepFlight, timedRideFinished, wrapCourse, type Calibration, type FlightControls } from './flight';
import { createWorld, terrainHeight, parseValleyStyle, type ValleyStyle, type Environment, type Quality } from './world';
import './game.css';
import { enterFlightFullscreen } from './display';
import { roadCameraPose } from './road-camera';
import { initialRace, stepRace, racePose, racePosition, raceGuidance, ROAD_LENGTH, type RaceDifficulty } from './race';
import { HitAudio } from './hit-audio';
import { awakeStatusLabel, ScreenAwakeController, type AwakeState } from './wake-lock';
type PassNotice = { sequence: number; text: string };
type PlayStatus = 'ready' | 'running' | 'paused' | 'finished';
type Mode = 'scenic' | 'arcade';
interface Stats { rivals?: { name: string; gap: number }[]; position?: number; distance?: number; speed: number; altitude: number; score: number; elapsed: number; fps: number; effortHint: number; target: string; direction: string; }
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function Game({ adapter, state, simulate }: { adapter: BikeDataAdapter; state: BikeState; simulate: () => void }) {
  const workspace = useRef<HTMLElement>(null);
  const [immersive, setImmersive] = useState(false), [displayMessage, setDisplayMessage] = useState('');
  const nativeFullscreen = useRef(false);
  const host = useRef<HTMLDivElement>(null), engine = useRef<{ reset: () => void } | null>(null);
  const controls = useRef<FlightControls>({ steer: 0, pitch: 0 }), keys = useRef(new Set<string>());
  const [status, setStatus] = useState<PlayStatus>('ready'), statusRef = useRef<PlayStatus>('ready');
  const [mode, setMode] = useState<Mode>('arcade'), modeRef = useRef<Mode>('arcade');
  const audio = useRef(new HitAudio());
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('skycycle.sound') === 'on'; } catch { return false; } });
  const [audioNotice, setAudioNotice] = useState('');
  const [hitFeedback, setHitFeedback] = useState<{ sequence: number; points: number; kind: 'ring' | 'balloon' }>();
  useEffect(() => { audio.current.setEnabled(sound); return () => { audio.current.setEnabled(false); }; }, [sound]);
  useEffect(() => () => { audio.current.dispose(); }, []);
  const toggleSound = () => {
    const next = !sound; setSound(next); audio.current.setEnabled(next); setAudioNotice('');
    try { localStorage.setItem('skycycle.sound', next ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (next) void audio.current.unlock().then(ready => { if (!ready) setAudioNotice('Sound is unavailable or blocked. Visual hit feedback remains active.'); });
  };
  const [valleyStyle, setValleyStyle] = useState<ValleyStyle>(() => { try { return parseValleyStyle(localStorage.getItem('skycycle.valleyStyle')); } catch { return 'enhanced'; } });
  const [renderInfo, setRenderInfo] = useState('');
  const [quality, setQuality] = useState<Quality>('high');
  const [environment, setEnvironment] = useState<Environment>(() => { try { const saved = localStorage.getItem('skycycle.environment'); return saved === 'space' || saved === 'road' ? saved : 'valley'; } catch { return 'valley'; } });
  const [dynamicCamera, setDynamicCamera] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dynamicCameraRef = useRef(dynamicCamera);
  useEffect(() => { dynamicCameraRef.current = dynamicCamera; }, [dynamicCamera]);
  const [passNotice, setPassNotice] = useState<PassNotice>();
  const [difficulty, setDifficulty] = useState<RaceDifficulty>('moderate');
  const difficultyRef = useRef(difficulty);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  const isRoad = environment === 'road';
  const changeEnvironment = (next: Environment) => { changeStatus('ready'); setHitFeedback(undefined); setEnvironment(next); try { localStorage.setItem('skycycle.environment', next); } catch { /* Optional preference. */ } };
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
    const request = () => { if (keepAwake && status === 'running' && document.visibilityState !== 'hidden') void controller.start(); };
    if (keepAwake && status === 'running') request();
    else setAwake({ kind: 'off', message: 'Keep-awake is off while paused or disabled.' });
    document.addEventListener('visibilitychange', request);
    return () => { mounted = false; document.removeEventListener('visibilitychange', request); controller.stop(); };
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
  const changeStatus = (next: PlayStatus) => { if (next === 'running' && audio.current.enabled) void audio.current.unlock(); statusRef.current = next; setStatus(next); };
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
    renderer.domElement.setAttribute('aria-label', environment === 'road' ? 'Road cycling race with five simulated riders' : environment === 'space' ? 'Flying bicycle among planets and spiral galaxies' : 'Three-dimensional flying bicycle in a mountain valley');
    container.appendChild(renderer.domElement);
    const world = createWorld(quality, environment, valleyStyle), camera = new THREE.PerspectiveCamera(60, 1, .3, 1700);
    let race = initialRace(), roadLap = 0;
    let passSequence = 0, passExpiry = 0;
    const passSides = race.riders.map(rider => Math.sign(rider.distance - race.distance));
    let flight = initialFlight(), score = 0, frame = 0, lastTime = performance.now(), statTime = lastTime, frameCount = 0, accumulator = 0, hitSequence = 0;
    const targetCamera = new THREE.Vector3(), targetLook = new THREE.Vector3(), look = new THREE.Vector3();
    const resetCamera = () => {
      if (isRoad) {
        const view = roadCameraPose(race, dynamicCameraRef.current);
        camera.position.set(view.x, view.y, view.z); look.set(view.lookX, view.lookY, view.lookZ); camera.fov = view.fov; camera.updateProjectionMatrix();
      } else { camera.position.set(flight.x, flight.y + 8, flight.z + 18); look.set(flight.x, flight.y + 3, flight.z - 25); }
    };
    if (isRoad) racePose(race, flight);
    resetCamera();
    engine.current = { reset() { flight = initialFlight(); race = initialRace(); roadLap = 0; setPassNotice(undefined); passExpiry = 0; race.riders.forEach((rider, i) => { passSides[i] = Math.sign(rider.distance - race.distance); }); if (isRoad) racePose(race, flight); score = 0; setHitFeedback(undefined); setStats(previous => ({ ...previous, score: 0, elapsed: 0, position: isRoad ? racePosition(race) : undefined, distance: 0 })); world.resetTargets(); resetCamera(); accumulator = 0; } };
    const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    // Warm every shared scenery material before flight, including distant batches.
    if (isRoad || environment === 'valley' && valleyStyle === 'enhanced') renderer.compile(world.scene, camera);
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
          if (isRoad) {
            stepRace(race, effort, difficultyRef.current, 1 / 60, modeRef.current === 'arcade'); racePose(race, flight);
            race.riders.forEach((rider, i) => {
              const gap = rider.distance - race.distance;
              // Require a clear gap on either side before announcing another pass.
              const side = gap > 3 ? 1 : gap < -2 ? -1 : passSides[i];
              if (side !== passSides[i]) {
                const previousSide = passSides[i]; passSides[i] = side;
                if (previousSide && race.elapsed > 5 && race.elapsed > passExpiry) {
                  const text = side > 0 ? `${rider.name} passed you` : `Passed ${rider.name}`;
                  setPassNotice({ sequence: ++passSequence, text: `${text} / P${racePosition(race)}` }); passExpiry = race.elapsed + 2.5;
                }
              }
            });
            if (passExpiry && race.elapsed > passExpiry) { setPassNotice(undefined); passExpiry = 0; }
          } else {
          const prev = { ...flight };
          stepFlight(flight, { ...input, steer: assistedRef.current ? assistedSteering(flight, world.targets) : input.steer }, effort, 1 / 60, environment === 'space' ? 4 : Math.max(4, terrainHeight(flight.x, flight.z) + 4));
          const gained = collectTargets(prev, flight, world.targets, hit => {
            world.celebrate(hit.index); audio.current.play(hit.target.kind);
            setHitFeedback({ sequence: ++hitSequence, points: hit.points, kind: hit.target.kind });
          });
          score += gained; if (gained) { const currentScore = score; setStats(previous => ({ ...previous, score: currentScore, elapsed: flight.elapsed })); }
          }
          accumulator -= 1 / 60;
          if (timedRideFinished(modeRef.current, flight.elapsed)) { race.elapsed = DEFAULT_RIDE_SECONDS; flight.elapsed = DEFAULT_RIDE_SECONDS; const finalScore = score; setStats(previous => ({ ...previous, score: finalScore, elapsed: DEFAULT_RIDE_SECONDS, position: isRoad ? racePosition(race) : undefined, distance: race.distance })); changeStatus('finished'); break; }
          if (isRoad) {
            const lap = Math.floor(race.distance / ROAD_LENGTH);
            if (lap !== roadLap) { camera.position.z += (lap - roadLap) * ROAD_LENGTH; look.z += (lap - roadLap) * ROAD_LENGTH; roadLap = lap; }
          }
          if (!isRoad && wrapCourse(flight, world.targets)) { world.resetTargets(); resetCamera(); }
        }
      } else accumulator = 0;
      world.bike.position.set(flight.x, flight.y, flight.z); world.bike.rotation.set(flight.pitch, -flight.heading, -flight.bank, 'YXZ');
      world.updateRace?.(race, modeRef.current === 'arcade', statusRef.current === 'running' ? dt : 0);
      world.update(flight.elapsed, statusRef.current === 'running' ? flight.thrust : .08, dt);
      let cameraRoll = 0;
      if (isRoad) {
        const view = roadCameraPose(race, dynamicCameraRef.current);
        targetCamera.set(view.x, view.y, view.z); targetLook.set(view.lookX, view.lookY, view.lookZ);
        const fov = camera.fov + (view.fov - camera.fov) * (1 - Math.exp(-dt * 2));
        if (Math.abs(fov - camera.fov) > .001) { camera.fov = fov; camera.updateProjectionMatrix(); }
        cameraRoll = view.roll;
      } else {
      targetCamera.set(flight.x - Math.sin(flight.heading) * 18, flight.y + 8, flight.z + Math.cos(flight.heading) * 18);
      targetLook.set(flight.x + Math.sin(flight.heading) * 28, flight.y + 3 + flight.pitch * 14, flight.z - Math.cos(flight.heading) * 28);
      }
      camera.position.lerp(targetCamera, 1 - Math.exp(-dt * 4)); look.lerp(targetLook, 1 - Math.exp(-dt * 4)); camera.lookAt(look); if (isRoad) camera.rotateZ(cameraRoll);
      renderer.render(world.scene, camera); frameCount++;
      if (timestamp - statTime > 500) {
        setRenderInfo(`${renderer.info.render.calls} draw calls | ${renderer.info.render.triangles.toLocaleString()} triangles | ${renderer.info.memory.geometries} geometries | ${renderer.info.memory.textures} textures`);
        const next = world.targets.find(t => !t.bonus && !t.hit && t.z < flight.z);
        const guidance = raceGuidance(race, modeRef.current === 'arcade');
        if (isRoad) setStats({ speed: race.speed * 3.6, altitude: 0, score: 0, elapsed: race.elapsed, fps: Math.round(frameCount * 1000 / (timestamp - statTime)), effortHint: guidance.effort, target: guidance.target, direction: '>', position: racePosition(race), distance: race.distance, rivals: race.riders.map(r => ({ name: r.name, gap: r.distance - race.distance })) });
        else setStats({ speed: flight.speed * 3.6, altitude: flight.y, score, elapsed: flight.elapsed, fps: Math.round(frameCount * 1000 / (timestamp - statTime)), effortHint: courseEffortHint(flight, next), target: next ? `${next.kind === 'ring' ? 'Ring' : 'Balloon'} · ${Math.round(Math.hypot(next.x - flight.x, next.y - flight.y, next.z - flight.z))} m · ${Math.round(next.y)} m altitude` : environment === 'space' ? 'Follow the starlight' : 'Follow the valley', direction: next ? next.x - flight.x > 15 ? '↗' : next.x - flight.x < -15 ? '↖' : next.y - flight.y > 8 ? '⇧' : next.y - flight.y < -8 ? '⇩' : '↑' : '↑' });
        frameCount = 0; statTime = timestamp;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', contextLost); world.dispose(); renderer.dispose(); renderer.domElement.remove(); engine.current = null; };
  }, [quality, environment, valleyStyle]);
  const launch = () => { engine.current?.reset(); changeStatus('running'); };
  const changeQuality = (next: Quality) => { changeStatus('ready'); setQuality(next); };
  const freshValue = (v: number | undefined, at: number | undefined) => v !== undefined && Date.now() - (at ?? state.sample.timestamp) < 3000 && ['simulated', 'connected'].includes(state.status) ? Math.round(v) : '—';
  const effortUnit = state.sample.watts === undefined && state.sample.cadence !== undefined ? 'RPM' : 'W';
  const suggestedEffort = Math.round((effortUnit === 'RPM' ? calibration.referenceCadence : calibration.referenceWatts) * stats.effortHint / calibration.gain);
  const awakeLabel = awakeStatusLabel(keepAwake, status, awake);
  return <section ref={workspace} className={`flight-workspace ${immersive ? 'immersive' : ''} ${environment === 'space' ? 'space-theme' : isRoad ? 'road-theme' : ''}`}>
    <div className="flight-toolbar"><div><span className="eyebrow">THE OPEN-SKY EXPERIMENT</span><h2>A different kind of headspace.</h2></div><div className="flight-actions"><button className="secondary" onClick={() => changeEnvironment(environment === 'valley' ? 'space' : environment === 'space' ? 'road' : 'valley')}>{isRoad ? 'World: Road race' : environment === 'space' ? 'World: Space' : 'World: Valley'}</button><button className="secondary sound-toggle" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Sound on' : 'Sound off'}</button><button className="secondary fullscreen-toggle" onClick={() => void toggleFullscreen()}>{immersive ? 'Exit full screen' : 'Full screen'}</button><button disabled={isRoad} className="secondary steering-switch" aria-pressed={assisted} onClick={() => setAssisted(!assisted)}>{isRoad || assisted ? 'Auto-steering on' : 'Manual steering'}</button><button className="secondary" onClick={() => { setShowSettings(!showSettings); if (status === 'running') changeStatus('paused'); }}>⚙ Flight settings</button><button className="secondary" onClick={() => { if (status === 'running') changeStatus('paused'); else if (status === 'paused') changeStatus('running'); else launch(); }}>{status === 'running' ? 'Ⅱ Pause' : status === 'paused' ? '▷ Resume' : '↗ Take flight'}</button></div></div>
    <div className="flight-view"><div className="scene-host" ref={host}/>
      <div className="flight-top"><span className="location-tag">{isRoad ? 'THE AMBER ROAD' : environment === 'space' ? '✦ THE STARLIGHT REACH' : '↟ THE AMBER VALLEY'} <small title={`Commit ${BUILD_INFO.commit} | ${BUILD_INFO.builtAt}`}>{BUILD_INFO.label} | {BUILD_INFO.commit}</small></span><span className="flight-mode">{mode === 'scenic' ? isRoad ? 'UNLIMITED GROUP RIDE' : '∞ SCENIC EXPLORATION' : `${isRoad ? 'ROAD RACE' : 'ARCADE'} · ${clock(Math.max(0, DEFAULT_RIDE_SECONDS - stats.elapsed))} LEFT`}</span></div>
      <div className="flight-hud"><Hud value={Math.round(stats.speed)} unit="KM/H" label="SPEED"/><Hud value={isRoad ? Math.round(stats.distance ?? 0) : Math.round(stats.altitude)} unit="M" label={isRoad ? "DISTANCE" : "ALTITUDE"}/>{isRoad ? <Hud value={`${stats.position ?? 3}/6`} label="POSITION"/> : <Hud value={stats.score.toString().padStart(4, '0')} label="SCORE" pulse={stats.score}/>}<Hud value={clock(stats.elapsed)} label={isRoad ? "RIDE TIME" : "FLIGHT TIME"}/></div>
      {hitFeedback && status === 'running' && <div key={hitFeedback.sequence} className={`hit-feedback ${hitFeedback.kind}`} role="status" aria-live="polite"><strong>+{hitFeedback.points}</strong><span>{hitFeedback.kind === 'ring' ? 'RING CLEARED!' : 'BALLOON POPPED!'}</span></div>}
      {status === 'running' && <div className="target-guide"><b>{stats.direction}</b><span>{stats.target}<small>Aim {suggestedEffort} {effortUnit} | {isRoad ? 'Optional pace guide' : stats.effortHint > 1.025 ? 'Gentle climb' : stats.effortHint < .975 ? 'Gentle dip - keep pedalling' : 'Steady cruise'}</small></span></div>}
      {isRoad && status === 'running' && passNotice && <div key={passNotice.sequence} className="race-pass" role="status">{passNotice.text}</div>}
      {isRoad && status === 'running' && mode === 'arcade' && stats.elapsed >= 280 && <div className="race-sprint">FINAL SPRINT / {clock(Math.max(0, 300 - stats.elapsed))}</div>}
      {isRoad && status === 'running' && <div className="race-pack" aria-label="Rider gaps">{stats.rivals?.map((rider, i) => <span key={rider.name}><i style={{ background: ['#c87155', '#699dc7', '#a18ac1', '#e3b84b', '#6caba0'][i] }}/>{rider.name} {Math.abs(Math.round(rider.gap))} m {rider.gap > 0 ? 'ahead' : 'behind'}</span>)}</div>}
      {state.dataWarning && status === 'running' && <div role="alert" className="flight-warning measurement-warning">Bike data rejected. Check the FTMS layout in Bike diagnostics. Thrust is fading.</div>}
      {state.status !== 'simulated' && state.status !== 'connected' && status === 'running' && <div className="flight-warning">Bike disconnected · thrust is fading <button onClick={simulate}>Use simulation</button></div>}
      {(status !== 'running' || error) && <div className="flight-overlay"><div><div className="eyebrow">{status === 'finished' ? 'COURSE COMPLETE' : status === 'paused' ? 'TAKE A BREATHER' : isRoad ? 'FIND YOUR PACK. FIND YOUR PACE.' : 'YOUR LEGS. YOUR WINGS.'}</div><h2>{error ? 'The ride is on hold.' : status === 'finished' ? isRoad ? 'Across the finish line.' : 'A ride above the ordinary.' : status === 'paused' ? 'Your ride can wait.' : isRoad ? 'A little friendly competition.' : 'Pedal beyond the everyday.'}</h2><p>{error || (status === 'finished' ? isRoad ? `Finished ${stats.position ?? 3} of 6 · ${Math.round(stats.distance ?? 0)} m in ${clock(stats.elapsed)}. Ready for a rematch?` : `${stats.score} points · ${clock(stats.elapsed)} in the air. Ready for another adventure?` : status === 'paused' ? 'Your ride is paused. Resume when you’re ready.' : isRoad ? 'Ride with Maya, Leo, Robin, Ari and Sam. Hold your comfortable effort to stay with the pack; brief surges help you pass. Maya sprints, Leo holds steady, Robin attacks, Ari recovers and Sam mixes the pace. Nearby fences and trees bring the speed to life.' : environment === 'space' ? 'Ride among spiral galaxies and ringed planets. Thread the golden rings and pop the floating balloons. The same comfortable effort powers your flight.' : 'Follow the river, thread the golden rings, and find your own pace. A comfortable effort is all it takes.')}</p>
        {status === 'ready' && <div className="mode-select"><button className={mode === 'scenic' ? 'active' : ''} onClick={() => setMode('scenic')}>{isRoad ? 'Group ride' : '∞ Scenic ride'}<small>{isRoad ? 'No timer. Ride with the pack.' : environment === 'space' ? 'No timer. Just the stars.' : 'No timer. Just open skies.'}</small></button><button className={mode === 'arcade' ? 'active' : ''} onClick={() => setMode('arcade')}>{isRoad ? 'Road race' : '◷ Arcade course'}<small>{isRoad ? 'Five minutes. Race the pack.' : 'Five minutes. Chase a score.'}</small></button></div>}
        {isRoad && status !== 'finished' && <label className="race-pace">Pack pace<select value={difficulty} onChange={e => setDifficulty(e.target.value as RaceDifficulty)}><option value="gentle">Gentle</option><option value="moderate">Moderate</option><option value="challenging">Challenging</option></select></label>}
        {!error && <button className="primary launch-button" onClick={() => status === 'paused' ? changeStatus('running') : launch()}>{status === 'paused' ? 'Resume ride' : isRoad ? status === 'finished' ? 'Race again' : 'Join the pack' : status === 'finished' ? 'Fly again' : 'Let’s take flight'} <span>↗</span></button>}
        {state.status !== 'simulated' && state.status !== 'connected' && <button className="secondary" onClick={simulate}>Use simulated bike</button>}
        <small className="control-hint">{isRoad ? 'Steering is automatic. Pedal to build speed; ease off to recover.' : assisted ? 'Auto-steering follows the rings. Pedal to gain lift; ease off to descend.' : 'Hold the left or right edge to steer. Pedal for lift; ease off to descend.'}<br/>Touch controls inside the game view. Space to pause.</small>
      </div></div>}
      {status === 'running' && !assisted && !isRoad && <SteeringZones controls={controls}/>}
      {status === 'running' && (awake.kind === 'unavailable' || awake.kind === 'released') && <div className="awake-warning" role="status">{awake.message}</div>}
      {displayMessage && <div role="status" className="display-message">{displayMessage}<button aria-label="Dismiss full-screen tip" onClick={() => setDisplayMessage('')}>Close</button></div>}
      <div className="flight-bottom"><div><span className="source-dot"/>{state.status === 'simulated' ? 'SIMULATED BIKE' : state.status === 'connected' ? 'BLUETOOTH BIKE' : 'NO BIKE DATA'} <b>{freshValue(state.sample.cadence, state.sample.cadenceAt)} <small>RPM</small></b><b>{freshValue(state.sample.watts, state.sample.wattsAt)} <small>W</small></b></div><span title={`${awake.message} | ${renderInfo}`}>{awakeLabel} | {stats.fps} FPS · {quality.toUpperCase()}</span></div>
    </div>
    <div className="flight-controls external-controls"><div className="flight-tip"><strong>{isRoad ? 'Auto-steering follows the road.' : assisted ? 'Auto-steering follows the course.' : 'Hold either edge of the game view to steer.'}</strong><p>{isRoad ? 'Hold a comfortable pace. Add a short surge to overtake.' : 'Pedal to build speed and lift. Ease off to descend.'}</p></div></div>
    {showSettings && <div className="panel flight-settings"><div className="panel-heading"><h3>Make the flight yours.</h3><button className="text-button" onClick={() => setShowSettings(false)}>Close settings</button></div><p className="muted">{BUILD_INFO.label} | Commit {BUILD_INFO.commit} | Built {new Date(BUILD_INFO.builtAt).toLocaleString()}</p><p className="muted">{isRoad && <>Road race: comfortable power sets your baseline speed. Pack pace changes rival effort; distinct rival personalities alternate attacks and recovery, then sprint in the final 20 seconds. The road rolls gently without changing the calibrated effort-to-speed curve. Disable the dynamic racing camera below for a fixed field of view and no camera lean. Steering is automatic, tilt is ignored, and coasting slows you down. Five-minute races finish on the timer; unlimited group rides continue. </>}{!isRoad && <>Auto-steering guides left and right toward the next target; your effort controls lift, and optional tilt or keyboard input adds pitch. Switch to manual steering above to use edge touch zones, tilt or a keyboard. Reference power is level cruise (default 45 W). Slightly less gives prompt descent; slightly more gives climb, without needing to stop pedalling. Changes affect virtual thrust only. Adjusting quality restarts the flight. Bluetooth setup and simulation RPM/watts are on the diagnostics tab. Timed rides last five minutes; the valley repeats until time runs out. Sound effects are optional, start off, and can be toggled above.</>}</p><div className="settings-grid"><label>Comfortable power <strong>{calibration.referenceWatts} W</strong><input type="range" min="30" max="200" step="5" value={calibration.referenceWatts} onChange={e => setCalibration({ ...calibration, referenceWatts: +e.target.value })}/></label><label>Cadence-only reference <strong>{calibration.referenceCadence} RPM</strong><input type="range" min="30" max="100" value={calibration.referenceCadence} onChange={e => setCalibration({ ...calibration, referenceCadence: +e.target.value })}/></label><label>Thrust gain <strong>{calibration.gain.toFixed(2)}×</strong><input type="range" min=".5" max="1.5" step=".05" value={calibration.gain} onChange={e => setCalibration({ ...calibration, gain: +e.target.value })}/></label>{environment === 'valley' && <label>Valley scenery<select aria-label="Valley scenery" value={valleyStyle} onChange={e => { const next = parseValleyStyle(e.target.value); changeStatus('ready'); setHitFeedback(undefined); setValleyStyle(next); try { localStorage.setItem('skycycle.valleyStyle', next); } catch { /* Optional preference. */ } }}><option value="classic">Classic Amber Valley</option><option value="enhanced">Enhanced Valley</option></select><small>Changing scenery restarts the flight.</small></label>}<label>Visual quality<select value={quality} onChange={e => changeQuality(e.target.value as Quality)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High (default)</option></select></label></div><div className="keep-awake-setting">{isRoad && <label><input type="checkbox" checked={dynamicCamera} onChange={e => setDynamicCamera(e.target.checked)}/> Dynamic racing camera / gentle field of view and corner lean</label>}<label><input type="checkbox" checked={keepAwake} onChange={e => setKeepAwake(e.target.checked)}/> Keep screen awake during rides</label><p className="muted" role="status">{awake.message} Requests are released on pause, finish or leaving flight. Browser/system limits still apply.</p></div><div className="tilt-row"><button className="secondary" disabled={!tiltSupported || isRoad} onClick={enableTilt}>{tilt ? 'Disable tilt controls' : 'Enable optional tilt'}</button>{tilt && <button className="secondary" onClick={() => { tiltBaseline.current = null; }}>Recenter tilt</button>}<button className="secondary" onClick={simulate}>Switch to simulated bike</button><button className="secondary" onClick={() => { engine.current?.reset(); changeStatus('ready'); }}>Reset flight</button></div>{audioNotice && <p role="status" className="muted">{audioNotice}</p>}{tiltMessage && <p role="status" className="muted">{tiltMessage}</p>}<p className="muted">With measured watts, power drives thrust. Cadence-only devices use RPM. If reported cadence stops or becomes stale, thrust decays even when power remains. Power-only devices rely on power freshness. Physics is an arcade approximation, not a training or aerodynamic model.</p></div>}
  </section>;
}
function Hud({ value, unit, label, pulse }: { value: string | number; unit?: string; label: string; pulse?: number }) { return <div><span>{label}</span><strong key={pulse} className={pulse ? 'score-changed' : undefined}>{value}<small>{unit}</small></strong></div>; }
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
