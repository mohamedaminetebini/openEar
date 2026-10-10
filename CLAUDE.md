# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is pnpm (11.x); Rust is needed for the desktop backend.

```bash
pnpm dev               # run the Tauri desktop app (starts pnpm dev:ui on :5173)
pnpm dev:ui            # Vite interface only; opening it in a browser shows the desktop-required message
pnpm build             # tauri build: .deb and AppImage under src-tauri/target/release/bundle/
pnpm typecheck         # tsc -b
pnpm lint              # eslint . --max-warnings 0
pnpm format:check      # prettier --check .  (pnpm format writes)
pnpm test              # Vitest unit tests (jsdom), src/**/*.test.{ts,tsx}
pnpm test:e2e          # Playwright, chromium, against the Vite dev server on :4173
pnpm desktop:test      # cargo test for src-tauri
```

Single tests:

```bash
pnpm exec vitest run src/features/devices/manufacturer.test.ts
pnpm exec vitest run -t "name fragment"
pnpm exec playwright test e2e/theme.spec.ts
cargo test --manifest-path src-tauri/Cargo.toml <test_name>
```

Rust checks used before commits: `cargo fmt --manifest-path src-tauri/Cargo.toml`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.

Playwright needs `pnpm exec playwright install chromium` once. The ignored hardware test (`physical_receiver_and_routing_round_trip`, run with `-- --ignored`) needs PipeWire and the H858 attached and temporarily changes playback routing; do not run it casually. `pnpm desktop:smoke` is the native WebDriver smoke test described in `docs/desktop.md`.

## Architecture

Openear is a Linux-only Tauri 2 desktop app. React renders the UI; the Rust core in `src-tauri/src/` performs all audio work and is independent of React. There is no HTTP server, pairing token, or browser control path.

**IPC boundary.** `src-tauri/src/main.rs` registers exactly two commands, `audio_state` and `audio_command`, and grants them only to the `main` window through `src-tauri/capabilities/main.json`. Both run `spawn_blocking` on a shared `Arc<Mutex<Audio>>`. The frontend parses every response with Zod (`src/features/system-audio/schema.ts`) and validates every outgoing command before invoking it. Changing a command or response shape requires changing both sides and the schema.

**Native core.** `audio.rs` owns discovery and lifecycle. It shells out to `pactl`, `pw-cli`/`pw-dump`, `bluetoothctl`, and `amixer` with argument arrays (no shell) and timeouts. Its `Audio` struct holds the active EQ session (child process, temp directory, the previous default sink and stream routes for restoration). `eq.rs` builds the PipeWire filter graph and validates the ten bands (±12 dB). Routing is reversible: enabling EQ routes the default sink and existing streams through the filter sink `openear.system-eq`; disabling or quitting restores them. A background thread in `main.rs` calls `Audio::monitor()` every 2 seconds; it auto-switches the default output to a newly connected USB or Bluetooth sink when EQ is off, and stops EQ if its target disappears. Closing the window while EQ is active hides it instead of exiting; the tray's "Quit and restore audio" runs `stop()` on exit.

**Device identity.** Output `transport` comes from PipeWire properties (`device.bus`, `bluez_output.*` names). Brand recognition is exact-ID only: the H858 USB receiver `3206:0881` (USB vendor/product) and, for Bluetooth outputs, the BlueZ Modalias `bluetooth:v05D6p000Ad0240` read via `bluetoothctl info`. Names and OEM strings are never used. The frontend mirror is `src/features/devices/manufacturer.ts`, which maps a snapshot to a theme.

**Frontend state.** `src/features/system-audio/store.ts` (zustand `useNativeAudio`) owns the native snapshot, a single-flight `initializeDesktopAudio()` (called once from `main.tsx`, guarded against React StrictMode double-mount), a serialized request queue, and polling. `src/stores/app-store.ts` (`useApp`) holds the current EQ settings; `setEq` debounces 200 ms before calling `applySystemEq`. Profiles are in IndexedDB via Dexie (`src/lib/db/database.ts`, database name `headroom` is intentional, do not rename it) with TanStack Query on top. Theme is `src/features/settings/theme.ts` (`data-theme` on `<html>`, localStorage key `openear.theme`).

**Profiles versus EQ.** A profile only changes system audio while desktop EQ is active. `applySavedEq` sends the EQ to the native core and records it in the app store; the profiles panel says so when EQ is off.

**UI.** Feature folders under `src/features/` (sound/system-audio, equalizer, devices, profiles, settings, diagnostics). Shared primitives are shadcn/ui in `src/components/ui`; styling is Tailwind v4 plus the token-based stylesheet `src/styles.css`, with Redragon overrides keyed on `:root[data-manufacturer='redragon']`. Heavy panels are lazy-loaded in `App.tsx`. Memoization is in place (`memo` on panels and EQ bands, `useCallback` for handlers); keep it when editing those components.

## Testing layout

Unit tests use Vitest + Testing Library with `src/tests/setup.ts`. Playwright tests in `e2e/` run the real UI with `e2e/desktop-fixture.ts`, which fakes `window.__TAURI_INTERNALS__` and an in-memory native snapshot, so they check presentation and IPC wiring but not hardware. Rust unit tests live next to the code in `audio.rs` and `eq.rs`.

## Conventions

Keep native operations in the Rust core; do not add shell strings, new Tauri permissions, or remote origins. Add a manufacturer integration or theme only with exact verified identifiers and bundled assets with their license (`public/brands/ATTRIBUTION.md`). The product name is Openear everywhere; the Dexie database name `headroom` is the one intentional exception, because renaming it would orphan existing user profiles.
