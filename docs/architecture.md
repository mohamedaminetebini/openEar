# Desktop architecture

Openear has one product: the Tauri desktop application. React presents controls; the Rust audio core operates independently of React. `src-tauri/src/main.rs` is the Tauri boundary exposing only `audio_state` and `audio_command` to the local main window.

## Ownership

- `src-tauri/src/audio.rs` owns Linux output discovery, H858 USB metadata, ALSA mixer operations, serialized audio lifecycle, reversible routing, and background monitoring.
- `src-tauri/src/eq.rs` validates ten-band settings and creates the PipeWire graph/control parameters.
- `features/system-audio` validates native snapshots, serializes frontend requests, polls devices, tracks the selected output, and reports actual errors. There is no HTTP transport or token fallback.
- `features/devices/manufacturer.ts` matches verified receiver identifiers and the selected output to a bundled manufacturer identity. Unknown outputs use a neutral identity. Appearance is separate from capability detection.
- `features/equalizer` owns settings and presets; `features/audio` holds the Web Audio graph used for in-webview EQ processing.
- Zustand stores application and audio snapshots. TanStack Query caches profiles. Dexie persists preferences and profiles in the existing desktop IndexedDB database.

Initialization is single-flight and lives outside React. A generation prevents stale native responses from overwriting a disposed session. Tauri's Rust mutex serializes device operations; the frontend request queue prevents overlapping writes. Background monitoring runs independently of a hidden/throttled webview. A second app instance focuses the original window.

## UI and branding

Sound begins with output selection and desktop EQ activation, followed by the ten-band editor. Device contains receiver controls and explicit unsupported-feature guidance. Profiles contains local CRUD and application. Settings includes private storage, manufacturer-theme behavior, and redacted diagnostics.

Redragon branding requires selected receiver evidence and exact USB vendor/product identifiers `3206:0881`. A USB OEM manufacturer string or a name containing "Redragon" is insufficient. Theme tokens use the official asset palette; text/focus colors are adjusted for contrast. Radix portals inherit the theme from the document root. Switching output or losing the receiver resets the theme. All logos are bundled locally.

## Persistence and safe profiles

Schema v1 stores profiles and settings. Schema v2 adds metadata. The desktop-only transition keeps both schemas and the application identifier, preserving existing desktop data. Legacy metadata remains stored without any browser transport reading it. Removing old browser code never deletes user databases.

Profiles validate before application. Manufacturer settings are preserved in existing records but are rejected before audio settings apply because no proprietary native command adapter is installed. Audio profiles await active native EQ acknowledgement. Failed operations are reported rather than claiming successful application. Preferred profiles are marked for selection and never enable processing automatically.

## Audio

The native graph processes stereo playback at 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, and 16k Hz. End bands use shelf filters; other bands use peaking filters. Gains are bounded to ±12 dB. Positive gains reduce preamp gain by their sum; this conservative headroom can sound quiet with broad boosts. Bypass sets filter gains to zero and restores unity gain.

Audio not routed through Openear can bypass system processing.

## Additional integrations

Add a manufacturer integration only with exact model/firmware evidence, verified identifiers, transport documentation, validated payloads, license review, and physical tests. Rust transports must advertise only verified capabilities. No model is supported solely by brand name. Do not send guessed HID/USB/Bluetooth commands.

Future Windows/macOS playback processing and native Bluetooth Classic require concrete platform backends. WASM is unnecessary for current DSP or hardware communication and cannot grant permissions. See [desktop security and lifecycle](desktop.md).
