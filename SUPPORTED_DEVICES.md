# Hardware compatibility

Openear is a Linux desktop application. Audio-output detection, a USB receiver, and proprietary headphone features are separate capabilities.

| Device or integration                             | Support level       | Verified behavior                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux PipeWire playback                           | Partially supported | Actual system EQ, live settings, default-output routing, and restoration verified on the local installation. Apps that bypass the Openear output can bypass EQ.                                                                                                            |
| Redragon H858 receiver `3206:0881`, revision 1.00 | Partially supported | Actual USB metadata and receiver playback volume/mute, mic gain/mute, and automatic gain. Unchanged-value write/readback verified through Rust on 2026-10-10. Native UI enables EQ and applies live presets. Official Redragon branding follows receiver/output detection. |
| H858 battery, ANC, hardware EQ, internal 7.1      | Unsupported         | No verified protocol exposes these features. Internal 7.1 remains controlled by the headset's physical button. Automatic mic gain is not ANC.                                                                                                                              |
| Other Linux audio outputs                         | Experimental        | Enumerated through PipeWire; selectable for playback EQ. No manufacturer controls or branding are inferred from a name.                                                                                                                                                    |
| Sony, Bose, Soundcore, JBL, Sennheiser, Jabra     | Not tested          | No native manufacturer command adapters are installed.                                                                                                                                                                                                                     |
| Windows/macOS                                     | Unsupported         | Platform audio backends are not implemented.                                                                                                                                                                                                                               |

A USB receiver's presence does not prove the headset wireless link is active. Physical-button synchronization and acoustic gain calibration remain unverified.

## Verification

Record exact hardware/firmware, operating system, transport, and date. Test commands, acknowledgements, invalid payloads, disconnection, and restoration. Test receiver presence independently of the wireless link. For a manufacturer integration, document each feature separately with protocol and license evidence.

The opt-in Rust test briefly routes actual playback, updates EQ, writes all mixer settings unchanged, reads them back, and restores the previous output. The native UI smoke opens the actual Tauri window. See [verification commands](docs/desktop.md#physical-and-native-ui-verification). Controlled browser rendering with mocked IPC verifies presentation only.

Redact serial numbers, private output handles, audio filenames, MAC addresses, and device names from published reports. The app never reads USB serial numbers.
