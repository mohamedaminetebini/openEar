# Openear

A local-first desktop headphone controller built with Tauri, Rust, React 19, and strict TypeScript. The app detects Linux audio outputs and the supported H858 USB receiver automatically, applies a real ten-band system equalizer, and saves sound profiles locally.

Openear is desktop-only. There is no browser hardware controller, HTTP companion, token pairing, or hosted web product. Vite builds the interface embedded inside the desktop app.

## Install

Open the generated `Openear_0.1.0_amd64.deb` in your distribution's package installer, then launch **Openear**. End users need no Node.js, pnpm, Rust, terminal, or browser permissions. Use Linux with a working PipeWire session; the Debian package declares the required audio utilities and GUI libraries.

In **Sound**, choose your output and click **Enable desktop EQ**. Presets, saved profiles, and band adjustments apply to desktop playback routed through Openear. **Device** contains actual receiver playback and microphone controls. Turn off desktop EQ to restore the previous output. Closing the window while EQ is active keeps it running; use **Quit and restore audio** in the tray menu to exit.

See [installation and native lifecycle](docs/desktop.md). AppImage builds are also available, but require the host audio tools to be installed already. Windows and macOS audio backends are not implemented.

## Tested hardware

| Brand    | Model | USB receiver | Status                                                |
| -------- | ----- | ------------ | ----------------------------------------------------- |
| Redragon | H858  | `3206:0881`  | Receiver playback and microphone controls, desktop EQ |

The H858's internal 7.1 is controlled by its physical button. Battery and ANC are not available: the H858 has no ANC, and no verified protocol exposes battery.

## Manufacturer themes

A recognized, selected H858 receiver (`3206:0881`) uses Redragon's official white/red logo and a palette derived from it. Other outputs use a neutral Openear theme. Switching outputs or unplugging the receiver updates the theme. Branding follows verified identifiers, not a marketing name or a guess based on an OEM string. It never implies unsupported controls.

Manufacturer assets are bundled locally for offline use. See [asset attribution](public/brands/ATTRIBUTION.md). Openear is independent of manufacturers; their logos and trademarks are excluded from the project's MIT license.

## Features and limits

- Actual Linux audio-output and H858 USB discovery, with no serial numbers read or stored.
- PipeWire system playback EQ: ten bands, fourteen presets, live updates, bypass, conservative boost headroom, and reversible routing.
- Real receiver playback volume/mute, mic gain/mute, and mic automatic gain using ALSA.
- Profiles: create, rename, update, duplicate, delete, prefer, apply, and persist in IndexedDB.
- Manufacturer-aware appearance, keyboard controls, visible focus, reduced motion, narrow-window support, and safe copyable diagnostics.

No proprietary manufacturer protocol is implemented. H858 battery, ANC, internal 7.1, hardware EQ, and physical-button synchronization remain unavailable. Automatic microphone gain is not ANC. A detected receiver does not prove that its wireless headset is switched on. See [actual compatibility](SUPPORTED_DEVICES.md) and [protocol research](docs/protocol-research.md).

Applications pinned to another output, direct ALSA/JACK clients, passthrough audio, and microphone capture can bypass playback EQ. Select Openear's audio output in those apps where possible. Software EQ does not change headset firmware settings.

## Development

Use Node.js 22.12+, pnpm 11.15.1, Rust 1.90+ (tested with 1.95), and [Tauri's Linux development prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm format:check
pnpm desktop:test
```

`pnpm dev` starts the native app and its internal Vite interface server. `pnpm build` creates desktop installers under `src-tauri/target/release/bundle/`. `pnpm dev:ui` and `pnpm build:ui` are internal interface tooling; opening that interface in a browser shows a desktop-app launch message and exposes no hardware controls.

Playwright renders the desktop interface with controlled Tauri IPC fixtures. Install its development browser with `pnpm exec playwright install chromium`. Those tests validate UI behavior, not physical hardware. The opt-in Rust hardware test and actual Tauri/WebKit smoke workflow are documented in [desktop verification](docs/desktop.md#physical-and-native-ui-verification).

## Privacy, storage, and security

No accounts, analytics, cloud storage, device uploads, or runtime remote requests. Only the bundled main window receives two restricted native audio commands. There is no local HTTP listener. Rust validates commands, bounds gains, serializes operations, and uses subprocess argument arrays without a shell.

Existing desktop profiles and preferences retain the same IndexedDB origin and schema. Removing the browser controller does not clear local databases. Legacy manufacturer-setting profiles are retained but refused until a verified integration exists. Old browser-site profiles belong to that site's separate storage and are not automatically migrated.

Normal shutdown restores routing; forced termination or an audio-server crash can prevent restoration. Select the physical output in system sound settings if needed. No autostart service, permanent audio configuration, or secrets are installed.

Read [architecture](docs/architecture.md) and [contributing](CONTRIBUTING.md). MIT licensed, excluding third-party manufacturer assets.
