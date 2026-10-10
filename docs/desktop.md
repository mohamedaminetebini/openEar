# Openear desktop on Linux

The desktop-only Tauri application embeds its React interface with a Rust backend. Browser transports and the old HTTP companion have been removed. It discovers the H858 USB receiver and Linux audio outputs automatically. Desktop users do not start a companion, enter a token, or grant browser local-network permission. Node.js, pnpm, and Rust are development tools, not runtime requirements.

## Install and listen

Open `Openear_0.1.0_amd64.deb` in your distribution's package installer, install it, then launch **Openear** from the application menu. The Debian package declares PipeWire, its PulseAudio compatibility service, PulseAudio utilities, and ALSA utilities as dependencies. A working desktop PipeWire session is required; installing the application does not replace your audio server. The package is unsigned and currently built locally, not distributed through an update service.

Connect the H858 receiver, switch the headset to 2.4 GHz mode, and open **Sound**. Select the USB playback output and click **Enable desktop EQ**. Presets, band adjustments, and applied profiles now update the native filter. Activation requires this explicit action each time the app starts; saved profiles never silently enable hardware operations.

The receiver's playback volume/mute, mic gain/mute, and mic automatic gain controls use the actual ALSA mixer. USB presence does not prove that the wireless headset is on. No serial number is read. ANC, battery, internal 7.1, and headphone firmware EQ remain unavailable without a verified protocol.

System EQ processes playback routed through Openear's PipeWire output. Existing playback streams are moved to it and it becomes the default for new streams. Apps pinned to a physical output, direct ALSA/JACK clients, passthrough audio, and microphone capture can bypass it. Select **Openear System EQ** in those apps where possible.

While EQ is active, closing the window keeps audio running in the background. Reopen it from the tray or launch Openear again. Use **Quit and restore audio** in the tray menu to exit and restore routing. When EQ is inactive, closing the window exits. Tray availability depends on the desktop environment; relaunching always brings the single existing instance forward. Unplugging the selected output or losing the filter stops processing through a background monitor.

Profiles and preferences persist locally in the desktop webview's IndexedDB. This storage is separate from the browser site's storage; existing browser profiles are not automatically migrated. There is no cloud backup.

An AppImage, when built, still requires the same host audio tools and a compatible Linux desktop. It does not install missing audio dependencies. Windows and macOS audio backends are not implemented.

## Build and develop

Install Node.js/pnpm as described in the README, Rust 1.90 or newer (tested with 1.95), and [Tauri's Linux development prerequisites](https://v2.tauri.app/start/prerequisites/#linux). Then run:

```bash
pnpm install
pnpm desktop:dev
pnpm desktop:build
```

Desktop development starts Vite itself; stop any separately running `pnpm dev:ui` using port 5173 first. Release binaries and installers are under `src-tauri/target/release/` and `src-tauri/target/release/bundle/`. The release app embeds `dist/` and runs without a development server. Package builds need network access to fetch build tools; the installed app makes no remote requests.

```bash
pnpm desktop:check
pnpm desktop:test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Security and lifecycle

The desktop frontend uses Tauri IPC, not a localhost HTTP server. Only the local main window receives the two `audio_state` and `audio_command` permissions. The production content security policy restricts remote resources and no remote-origin capabilities are granted. No broad filesystem or shell permission is exposed to JavaScript. Opening the development interface in an ordinary browser displays only a desktop-launch message.

Commands accept a strict operation enum, validated output handles, bounded gain values, and booleans. Unknown fields/operations are rejected. Rust uses argument arrays without a shell, with bounded output and subprocess timeouts. A mutex serializes audio operations; React Strict Mode initialization uses one shared connection attempt. A second app instance focuses the first. Starting EQ refuses to take over another existing Openear filter, including any older Openear process.

The filter configuration lives in a private temporary directory. Failed starts attempt routing rollback; normal disable and application exit restore the old default and surviving stream routes. Forced termination, a machine crash, or audio-server failure can prevent restoration. If needed, select the physical output in system sound settings and restart Openear. No persistent audio configuration, autostart service, or credentials are installed.

## Physical and native UI verification

The ignored Rust physical test requires a running PipeWire session and the attached H858. It briefly changes playback routing, updates the live filter, writes each receiver mixer setting unchanged and reads it back, then restores the original default:

```bash
cargo test --manifest-path src-tauri/Cargo.toml physical_receiver_and_routing_round_trip -- --ignored
```

The native UI smoke workflow uses **tauri-driver** and **WebKitWebDriver** on Linux. Install those development-only tools, build a debug desktop binary (`pnpm tauri build --debug --bundles deb`), start `tauri-driver --native-driver /path/to/WebKitWebDriver`, then run:

```bash
pnpm desktop:smoke
```

The smoke opens the actual Tauri window, verifies automatic USB detection and no token form, enables system EQ through the UI, applies a live preset, rejects an invalid IPC command, disables processing, and checks routing restoration. It requires receiver `3206:0881` and temporarily changes playback. `OPENEAR_DESKTOP_BINARY` selects another binary and `OPENEAR_WEBDRIVER` selects a loopback driver address. WebDriver support requires a debug build; production IPC is additionally restricted by its release CSP.

The interface tests use controlled desktop IPC fixtures separately. These fixtures alone do not establish hardware compatibility. Physical button synchronization, acoustic calibration, proprietary controls, and other operating systems remain unverified.
