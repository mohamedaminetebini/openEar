# Openear

A desktop headphone controller for Linux. Openear routes system audio through a ten-band equalizer, saves sound profiles, and works with any headphones that PipeWire can play to, over USB or Bluetooth.

Built with Tauri 2, Rust, React 19, and strict TypeScript.

## Features

- **Any output:** lists the audio outputs PipeWire sees, with USB and Bluetooth icons.
- **Desktop EQ:** ten bands, bypass, and presets, applied to system playback through PipeWire. Turning EQ off restores your previous output.
- **Sound profiles:** save, rename, duplicate, prefer, and apply EQ settings. Profiles are stored locally.
- **New devices:** when a USB or Bluetooth headset connects while EQ is off, Openear makes it the default output.
- **Brand themes:** headphones are themed only when their hardware IDs match a known device. Everything else uses a neutral theme. Redragon H858 is the first brand supported.
- **Light and dark mode**, keyboard navigation, and a tray icon.

## Install

Open the `.deb` (or run the AppImage) and launch **Openear**. You need a Linux desktop running PipeWire. The Debian package installs the required audio tools.

Build the packages yourself with `pnpm build`. Installers are written to `src-tauri/target/release/bundle/`.

## Using it

1. Choose your headphones in **Sound**.
2. Turn on **Desktop EQ**. Adjust bands or pick a preset.
3. Save the result as a profile in **Profiles**.

Profiles only change sound while Desktop EQ is on. Closing the window keeps EQ running in the background; use **Quit and restore audio** from the tray to exit and restore your output.

## Limits

- Linux with PipeWire only. Windows and macOS backends are not implemented.
- Desktop EQ processes audio played through Openear's output. Apps pinned to another output, direct ALSA/JACK clients, and passthrough audio bypass it.
- Desktop EQ does not change headset firmware settings. Headset-specific features (such as hardware EQ, ANC, or battery) are not available unless a verified integration exists.
- Bluetooth connections can drop; EQ stops if the headset disconnects.

See [supported devices](SUPPORTED_DEVICES.md) for what has been verified on real hardware.

## Development

Requirements: Node.js 22.12+, pnpm 11, Rust 1.90+, and [Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```bash
pnpm install
pnpm dev          # run the desktop app
pnpm test         # unit tests
pnpm test:e2e     # UI tests (run `pnpm exec playwright install chromium` once)
pnpm desktop:test # Rust tests
pnpm lint
pnpm typecheck
pnpm format:check
```

Architecture, the native audio lifecycle, and the security model are in [docs/architecture.md](docs/architecture.md) and [docs/desktop.md](docs/desktop.md). Contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

No accounts, analytics, cloud storage, or network requests. Profiles and preferences stay on your computer.

## License

MIT, excluding third-party manufacturer logos and trademarks. See [public/brands/ATTRIBUTION.md](public/brands/ATTRIBUTION.md).
