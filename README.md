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

The development server is HTTP. `localhost` is suitable for desktop Web Bluetooth testing; a phone opening your computer's LAN IP needs trusted HTTPS. Use a Pages deployment below for phone testing. Never bypass certificate warnings. The app is static and has no backend, account, telemetry or diagnostic upload. Fonts are an optional Google Fonts stylesheet; system fonts work offline. No secret environment variables are needed.

## Phase 1 — read-only BLE diagnostics

The default tab is the diagnostic workspace. The simulated adapter starts at 65 RPM / 85 W. Independent sliders let you test zero cadence, power and comfortable effort without hardware.

`Connect Bluetooth bike` calls `requestDevice` directly from a user click. The picker accepts all BLE devices because advertising need not include a known fitness service. Optional services are FTMS (`1826`), Cycling Power (`1818`), CSC (`1816`), Heart Rate (`180D`) and Battery (`180F`). Additional **known** vendor service UUIDs can be requested in Advanced before selection. Reconnect after changing them; permissions are scoped to the original request.

Discovery attempts `getPrimaryServices` and separately probes each explicitly requested service. Browser permissions, OS restrictions, blocklists and the device can all limit this inventory. A missing service is logged as unavailable, never proof that the device lacks it. All accessible characteristics and their read/notify/indicate properties appear. Known measurements subscribe automatically; unknown formats require an explicit Read or Listen action. Unknown bytes are not decoded as cadence or power. Device Information and Generic Access are intentionally not requested or read, to avoid identifiers.

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

Parser references: [Bluetooth SIG GATT Specification Supplement](https://btprodspecificationrefs.blob.core.windows.net/gatt-specification-supplement/GATT_Specification_Supplement.pdf), [Cycling Power Service 1.1](https://www.bluetooth.com/specifications/specs/cycling-power-service-1-1/), [CSC Service 1.0](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSCS_v1.0/out/en/index-en.html), and [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/). Fixtures test software behavior; they are not device captures or certification.

## Deployment

Both targets provide HTTPS. No SPA route rewrites are necessary: navigation stays within one page and Vite uses a relative asset base for project subpaths.

### Cloudflare Pages

Push this repository to your GitHub account, then create a Pages project connected to it. Use build command `npm run build`, output directory `dist`, root directory `/`, and Node 24. A preview deployment is sufficient for phone testing. For a direct upload, run `npm ci && npm run build` locally and upload `dist` using the Cloudflare Pages dashboard. Do not upload source diagnostics or personal captures.

### GitHub Pages

Push this repository to GitHub. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. The included `.github/workflows/pages.yml` builds/tests and deploys `dist` on a push to `main` or manual dispatch. The workflow requests only repository-read and Pages deployment permissions; GitHub may require enabling Actions/Pages and approving its deployment environment. The project URL will be `https://<owner>.github.io/<repository>/`. Bluetooth and tilt are always invoked on button clicks, including on the deployed site.

No remote existed when this workspace was initialized; local implementation does not imply that a GitHub repository has been created or published.
