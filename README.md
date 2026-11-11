# SkyCycle

An original pedal-powered flying-bicycle experiment for a Yesoul GM1 Plus, iPhone running Bluefy, and a 21.5-inch mirrored display. React + TypeScript + Vite. **Yesoul hardware, Bluefy, tilt and cable/display compatibility are unverified.** This repository contains software validation, not a hardware compatibility claim. No Namco assets or proprietary Yesoul protocol are included.

## Run and validate

Node.js 22.12+ (or 24 LTS) and npm:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The ordinary development server is HTTP. `localhost` is suitable for desktop Web Bluetooth testing; a phone opening your computer's LAN IP needs trusted HTTPS. Use local HTTPS below or a Pages deployment for phone testing. Never bypass certificate warnings. The app is static and has no backend, account, telemetry or diagnostic upload. Fonts are an optional Google Fonts stylesheet; system fonts work offline. No secret environment variables are needed.

### Local HTTPS and iPhone access with mkcert

1. Install [mkcert](https://github.com/FiloSottile/mkcert). On Windows: `winget install --id FiloSottile.mkcert --exact --source winget`. Open a new terminal after installation so its PATH includes mkcert.
2. Run `npm run setup:https`. This generates a server certificate for localhost, the PC hostname, and current IPv4 addresses. It creates the CA in mkcert's default per-user directory if needed. It does **not** change your PC's certificate trust store. Optional PC trust is a separate `mkcert -install` step you can perform yourself; it is unnecessary for iPhone-only testing.
3. Run `npm run dev:https` and leave it running. It listens on HTTPS port **5173** and requires the generated certificates (no silent HTTP fallback). Keep the PC and iPhone on the same local network.
4. In a second terminal run `npm run cert:serve`. It prints an HTTP certificate download link on port **5180**. Open that link in **Safari on iPhone** to download `skycycle-rootCA.cer`. This bootstrap server serves only the public certificate and an instruction page; it cannot browse the project or CA directory.
5. On iPhone, open **Settings → Profile Downloaded**, or **General → VPN & Device Management**, select the downloaded mkcert certificate profile, and install it. Then go to **Settings → General → About → Certificate Trust Settings** and enable full trust for that root certificate. See [Apple's certificate trust instructions](https://support.apple.com/en-us/102390).
6. Open the printed **HTTPS** app address in **Bluefy**, such as `https://<PC-LAN-IP>:5173/`. It should load without a certificate warning. Tap Connect Bluetooth bike to request bike access. Actual hardware compatibility still needs testing.
7. Stop the certificate-download server with Ctrl+C after installation. Keep the HTTPS server running for your ride. After a restart, use `npm run dev:https` again. Regenerate with `npm run setup:https` when your PC's LAN IP changes; the iPhone trust remains valid while the same mkcert CA is used.

Windows Firewall must permit Node on the current network for these ports, and guest Wi-Fi/client isolation can prevent phone-to-PC traffic. HTTPS assets use relative URLs, so no hostname change in application code is required. Port 5173 is strict: stop an existing HTTP development server before starting HTTPS.

The generated `.certs/` directory and certificate/key extensions are ignored by Git. Vite explicitly refuses to serve `.certs`, `.local` and private-key/certificate paths. Only the **public** root certificate is copied for phone installation; never share `rootCA-key.pem` or `skycycle-key.pem`, and never put keys in `public/`. Trusting this development CA allows your phone to trust certificates it signs; install only the CA you generated on your own PC. Remove its iPhone profile when local testing is no longer needed. Local CA certificates are for development, not deployment.

## Phase 1 — read-only BLE diagnostics

The default tab is the diagnostic workspace. The simulated adapter starts at 65 RPM / 85 W. Independent sliders let you test zero cadence, power and comfortable effort without hardware.

`Connect Bluetooth bike` calls `requestDevice` directly from a user click. The picker accepts all BLE devices because advertising need not include a known fitness service. Optional services are FTMS (`1826`), Cycling Power (`1818`), CSC (`1816`), Heart Rate (`180D`) and Battery (`180F`). Additional **known** vendor service UUIDs can be requested in Advanced before selection. Reconnect after changing them; permissions are scoped to the original request.

Discovery attempts `getPrimaryServices` and separately probes each explicitly requested service. Browser permissions, OS restrictions, blocklists and the device can all limit this inventory. A missing service is logged as unavailable, never proof that the device lacks it. All accessible characteristics and their read/notify/indicate properties appear. Known measurements subscribe automatically; unknown formats require an explicit Read or Listen action. Unknown bytes are not decoded as cadence or power. Device Information and Generic Access are intentionally not requested or read, to avoid identifiers.

### If Bluefy never opens a device picker

Use the trusted HTTPS app URL in Bluefy itself. In iPhone Settings, check **Privacy & Security → Bluetooth → Bluefy** if listed. Failure before a picker appears does not establish a proprietary bike lock: no device has been selected or connected at that point. Also test without the mirroring cable to isolate the setup, without assuming the cable is responsible.

Connection troubleshooting shows HTTPS/API availability and the label **BLE diagnostics v2**. Tap **Test device picker only** to request selection with no optional services and no GATT connection. A successful selection confirms only the picker path; use the normal Connect button afterward for measurement discovery. Both requests run directly from a click, without a preceding asynchronous permission/availability check. Full standard UUID strings are used for optional services to avoid dependence on short-number normalization in native bridges. This is a defensive interoperability change, not a verified Bluefy fix. If the picker-only request fails too, the problem is earlier than service discovery; if it works and normal Connect fails before selection, compare request-option support.

Errors now identify device selection vs GATT connection vs discovery/subscription and show native error names/messages **locally**. Some browser bridges reject with strings or plain objects; these are handled without losing the error detail. Local browser error text can contain private information, so it is never included in downloadable JSON. Report the failing stage and reviewed error text; do not share device identifiers. The picker-only test never asks the bike to change state or send data.

Supported parsing:

- Indoor Bike Data `2AD2`: inverted More Data bit, all optional fields, signed power, half-RPM cadence and little-endian fields.
- Cycling Power Measurement `2A63`: signed power and optional balance, torque, wheel/crank data, force, angles and energy.
- CSC Measurement `2A5B`: wheel and crank counters; cadence from consecutive crank events in 1/1024 seconds, with 16-bit wrap handling. Wheel speed is not inferred without a measured wheel circumference.
- Heart Rate `2A37`, including 16-bit values and RR intervals, and Battery `2A19` for local diagnostics.

**Resistance layout revision:** the current GATT Specification Supplement (2026-09-09, §3.139) uses uint8 resistance; legacy FTMS layouts use sint16. Advanced offers an explicit parser setting, recorded in the log. Default is current GSS. Select the legacy layout only with evidence from device documentation/captures; there is no heuristic protocol detection. This setting never writes resistance. Incorrect choice can misalign following fields when bit 5 is present. Packets without resistance are unaffected.

Malformed packets produce raw parse errors, not partial interpreted values. Field freshness is tracked separately for cadence and watts. Cadence needs two crank notifications; repeated unchanged events do not refresh derived cadence. Stale data is zeroed for flight after three seconds. Disconnect clears adapter values and listeners. Reconnection always requires an explicit user action.

### Bluefy + iPhone hardware test procedure

1. Deploy over HTTPS and open the URL in Bluefy. Check `window.isSecureContext` and Web Bluetooth support through the app's connection errors. Safari support is not assumed. Allow iOS Bluetooth access for Bluefy when prompted.
2. Wake the GM1 Plus by pedalling. Close Yesoul and other bike apps that may hold the BLE connection. Do not pair or adjust resistance through SkyCycle.
3. Tap **Connect Bluetooth bike**, select the intended bike and approve the browser's permissions. Verify the status and accessible characteristics. Do not infer compatibility from a successful connection alone.
4. At rest, then low/medium cadence (for example 40/60/80 RPM), compare interpreted cadence and watts against an independent bike display/app when available. Record whether power is measured, estimated, absent or implausible. Test both parser layouts only if resistance bit 5 is present and evidence is available.
5. Stop pedalling. Confirm cadence becomes zero/stale and flight thrust decays. Disconnect/power down the bike during a ride; confirm the warning, gradual descent and simulation recovery. Reconnect and ensure no duplicated notification streams.
6. Background Bluefy, lock/unlock the phone, rotate to landscape, and connect the screen-mirroring cable. iOS can suspend notifications/rendering; the game pauses on visibility loss and discards old samples. Confirm actual mirroring, touch accessibility, audio-free operation and frame rate on your hardware. Cable capability and screen mirroring are external to this app.
7. Export the JSON log, inspect it, and record an explicit pass/fail per test, with iPhone model, iOS/Bluefy version, bike firmware (if available) and selected layout **separately, without device serials**. Only then update compatibility status.

### Diagnostic privacy and unknown Yesoul behavior

The local event stream shows relative timestamps, UUIDs, interpreted data and opt-in raw hex as escaped React text. No HTML or scripts are executed from device data. The stream is bounded to 800 events, refreshes twice per second, can be frozen/cleared, and is lost on page reload. **Raw vendor bytes can contain identifiers.** Review locally and do not blindly share captures.

Downloadable JSON intentionally excludes every raw payload, names, device IDs, heart rate, and unknown interpreted values. It includes UUIDs, sanitized status/errors, parser configuration, relative timing and cycling measurements. This minimizes identifiers but exercise data can still be personal; review before sharing. Clearing the log clears only the in-memory diagnostic history, not browser Bluetooth permissions (revoke those in browser/iOS settings).

Unknowns: whether this particular GM1 Plus exposes any standard services; required service authorization; cadence/power units and flags; any vendor characteristic structure, authentication or notification prerequisite. The app **does not guess a proprietary protocol, write characteristics, request control or change resistance**. Web Bluetooth notification subscription may internally configure the CCCD; the application never issues characteristic/control-point writes.

To proceed when standard measurements are unavailable, gather accessible service/characteristic UUIDs and properties, subscription errors, packet lengths, notification intervals, and redacted byte changes at rest and several independently known cadences/powers. Known vendor service UUIDs may need an external BLE inspector/vendor documentation before this page can request access. Obtain protocol documentation or lawful, consented passive captures; do not invent handshake bytes. Keep device names, MAC addresses, serials and private payloads out of shared logs. Exported JSON cannot reconstruct vendor payloads by design.

### Architecture

`src/bike/types.ts` defines `BikeDataAdapter`. `bluetooth.ts` owns permissions, GATT, parsing, subscriptions, sanitized logs and disconnects. `simulated.ts` implements the same subscription/snapshot interface. `parsers.ts` is transport-independent. Flight receives adapter snapshots; its rendering code never calls Bluetooth. Unit tests exercise standard byte fixtures, malformed lengths, rollover, discovery fallback, permission errors, privacy and disconnect cleanup. Browser mocks cannot validate an actual radio or Bluefy implementation.

### Remembered bike

After a successful GATT connection, SkyCycle remembers the selected bike's browser-scoped ID, display name, requested vendor service UUIDs and parser layout in this browser's local storage. These identifiers are **never included in diagnostic JSON or sent to a server**. Tap **Reconnect saved bike** to reuse the device during the current page session, or retrieve the exact previously authorized device with `getDevices()` after reload when supported. If that API is unavailable, a picker filtered by the saved name is used; identical device names may still need manual selection. A missing/revoked authorization asks you to choose again rather than connecting to an unrelated device.

**Choose another bike** opens the full picker. **Forget saved bike** deletes SkyCycle's local preference; it does not revoke browser/iOS Bluetooth permissions or end a current connection. Reconnecting remains a user action, never an automatic background connection. The preference belongs to the exact browser and origin, including port, so it does not transfer between the LAN and hosted URLs. Private browsing, cleared storage or a changed device ID can require selection again. Storage failures do not prevent riding. Picker-only tests do not overwrite the preference. Bluefy supports `getDevices` in its published release notes, but actual reconnect behavior still depends on the installed browser and device.

## Phase 2 — flight simulation

The flight tab contains an original, procedural Three.js valley with river, mountains, villages, bridges, trees, clouds, golden rings and balloons. A propeller-driven bicycle uses a chase camera, fixed-step arcade flight physics, smoothed thrust/steering, speed inertia, lift, gravity and gradual descent after cadence/data loss. Rings score 100 and balloons 250 only when actually crossed at the correct position and altitude. Scenic mode repeats the valley indefinitely; arcade ends after three minutes or reaching the course end. Speed, altitude, score, elapsed time, RPM, watts and observed FPS are displayed.

**Auto-steering is on by default** and smoothly guides left/right toward the next target. It does not change altitude or award hits automatically: pedalling builds thrust and lift, easing off reduces lift, and optional tilt or keyboard input adds pitch. This is suitable for a stationary bike without handlebar sensors. Use the toolbar switch for manual steering. That preference is saved locally. Standard cycling BLE profiles provide cadence/power here, not physical handlebar direction; the app does not assume a Yesoul steering protocol.

In manual mode, **touch zones cover the leftmost and rightmost 20% of the game viewport**, including full screen. Hold an edge to steer and release to return the steering input to neutral. The zones are inactive/absent in auto-steering mode, leaving the central 60% clear. Pointer capture handles release outside the zone; cancellation, lost capture and switching to auto-steering clear held input. Holding both sides cancels the steering input. There are no on-screen up/down buttons: pedal for thrust/lift and ease off for descent. Desktop arrows/WASD and optional tilt can still add pitch. Space pauses; Escape leaves the expanded page. Tilt requests permission and can be recentered. Visibility loss pauses flight and clears held input.

**Full screen** requests the browser's native Fullscreen API when available, with a fixed page-filling mode otherwise. Both keep HUD, pause/exit controls and touch controls visible; settings remain scrollable. The fallback cannot remove browser-owned bars. Bluefy advertises its own Full-screen mode; use that if its toolbar remains visible, and rotate the phone to landscape for the mirrored 21.5-inch display. Cable mirroring copies the phone's view, including visible controls/browser chrome; this app does not create a separate monitor view and phone-only controller. Phone aspect ratio and the mirroring setup can still introduce letterboxing. Actual iPhone/Bluefy fullscreen and mirror behavior requires hardware testing.

Flight settings adjust comfortable power (default 80 W), cadence-only reference (60 RPM), thrust gain and low/medium/high quality. Low is the iPhone default, using limited pixel ratio, instanced vegetation, modest terrain detail, no shadow maps or post-processing. Three.js loads only on the flight tab. Rendering consumes the shared adapter via `FlightInputAdapter`, with no Bluetooth calls in 3D code. Tests cover stale/disconnected input, comfortable calibration, glide-down behavior, scoring, assisted steering and fullscreen fallback. These are software checks; displayed desktop FPS does not guarantee iPhone performance.

Parser references: [Bluetooth SIG GATT Specification Supplement](https://btprodspecificationrefs.blob.core.windows.net/gatt-specification-supplement/GATT_Specification_Supplement.pdf), [Cycling Power Service 1.1](https://www.bluetooth.com/specifications/specs/cycling-power-service-1-1/), [CSC Service 1.0](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSCS_v1.0/out/en/index-en.html), and [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/). Fixtures test software behavior; they are not device captures or certification.

## Deployment

Both targets provide HTTPS. No SPA route rewrites are necessary: navigation stays within one page and Vite uses a relative asset base for project subpaths.

### Cloudflare Pages

Push this repository to your GitHub account, then create a Pages project connected to it. Use build command `npm run build`, output directory `dist`, root directory `/`, and Node 24. A preview deployment is sufficient for phone testing. For a direct upload, run `npm ci && npm run build` locally and upload `dist` using the Cloudflare Pages dashboard. Do not upload source diagnostics or personal captures.

### GitHub Pages

Push this repository to GitHub. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. The included `.github/workflows/pages.yml` builds/tests and deploys `dist` on a push to `main` or manual dispatch. The workflow requests only repository-read and Pages deployment permissions; GitHub may require enabling Actions/Pages and approving its deployment environment. The project URL will be `https://<owner>.github.io/<repository>/`. Bluetooth and tilt are always invoked on button clicks, including on the deployed site.

No remote existed when this workspace was initialized; local implementation does not imply that a GitHub repository has been created or published.
