# Contributing

Use pnpm, Rust, and the versions/prerequisites described in the README. `pnpm dev` runs the Tauri desktop app; `pnpm build` packages it. Before submitting changes, run formatting, lint, typecheck, unit tests, Playwright UI tests, Rust tests, Clippy, and a desktop production build.

Keep native operations in the React-independent Rust core. Tauri IPC must stay restricted to validated operations; do not introduce arbitrary shell commands, remote-origin permissions, HTTP pairing, telemetry, or secrets. Physical tests are opt-in because they temporarily change audio routing.

Match manufacturer themes and controls through verified identifiers, not names. Bundle logos locally and document their source and trademark ownership. Preserve a neutral fallback, keyboard navigation, reduced motion, minimum-window layout, readable contrast, and the distinction between desktop EQ and headset firmware EQ.

New integrations need exact model/firmware evidence, upstream license review, validated payloads, safe negative tests, and physical results. Never guess commands or advertise unverified capabilities. See [architecture](docs/architecture.md) and [actual compatibility](SUPPORTED_DEVICES.md).
