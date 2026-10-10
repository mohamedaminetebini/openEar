use crate::eq::{Eq, SINK};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    process::{Child, Command as Process, Stdio},
    thread,
    time::Duration,
};
use tempfile::TempDir;
use wait_timeout::ChildExt;

type Result<T> = std::result::Result<T, String>;
fn command(name: &str, args: &[&str]) -> Result<String> {
    let mut child = Process::new(name)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| format!("{name} is unavailable. Install the Linux audio dependencies."))?;
    let stdout = child.stdout.take().ok_or("Audio process has no output.")?;
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(2_097_153)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let status = match child.wait_timeout(Duration::from_secs(5)) {
        Ok(Some(status)) => status,
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err(format!("{name} timed out. Check the audio service."));
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| "Audio output reader failed.")?
        .map_err(|_| "Audio output could not be read.")?;
    if !status.success() || bytes.len() > 2_097_152 {
        return Err(format!(
            "{name} failed. Check PipeWire, device availability, and audio permissions."
        ));
    }
    String::from_utf8(bytes)
        .map(|value| value.trim().to_string())
        .map_err(|_| "Invalid audio service response.".into())
}
#[derive(Deserialize)]
struct Sink {
    index: u32,
    name: String,
    description: String,
    #[serde(default)]
    properties: HashMap<String, Value>,
}
#[derive(Deserialize)]
struct Stream {
    index: u32,
    sink: u32,
    #[serde(default)]
    properties: HashMap<String, Value>,
}
fn sinks() -> Result<Vec<Sink>> {
    serde_json::from_str(&command("pactl", &["-f", "json", "list", "sinks"])?)
        .map_err(|_| "Invalid output list.".into())
}
fn transport(sink: &Sink) -> &'static str {
    let bus = sink.properties.get("device.bus").and_then(Value::as_str);
    if bus == Some("bluetooth") || sink.name.starts_with("bluez_output.") {
        "bluetooth"
    } else if bus == Some("usb") {
        "usb"
    } else {
        "other"
    }
}
fn streams() -> Result<Vec<Stream>> {
    serde_json::from_str(&command("pactl", &["-f", "json", "list", "sink-inputs"])?)
        .map_err(|_| "Invalid playback stream list.".into())
}
fn receiver_card() -> Option<String> {
    for entry in fs::read_dir("/proc/asound").ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(number) = name.strip_prefix("card") {
            if !number.is_empty()
                && number.bytes().all(|byte| byte.is_ascii_digit())
                && fs::read_to_string(entry.path().join("usbmixer"))
                    .unwrap_or_default()
                    .contains("usb_id=0x32060881")
            {
                return Some(number.into());
            }
        }
    }
    None
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usb {
    vendor_id: String,
    product_id: String,
    manufacturer: String,
    product: String,
    revision: String,
}
fn usb(card: &str) -> Result<Usb> {
    let path = fs::canonicalize(format!("/sys/class/sound/card{card}/device"))
        .map_err(|_| "USB receiver unavailable.")?;
    let root = path
        .parent()
        .ok_or("USB receiver information unavailable.")?;
    let read = |name: &str| {
        fs::read_to_string(root.join(name))
            .map(|value| value.trim().to_string())
            .map_err(|_| "USB receiver information unavailable.".to_string())
    };
    let device = Usb {
        vendor_id: read("idVendor")?,
        product_id: read("idProduct")?,
        manufacturer: read("manufacturer")?,
        product: read("product")?,
        revision: read("bcdDevice")?,
    };
    if device.vendor_id != "3206" || device.product_id != "0881" {
        return Err("USB receiver changed during inspection.".into());
    }
    Ok(device)
}
fn mixer(text: &str) -> Result<(u8, bool)> {
    let percent = text
        .split('[')
        .filter_map(|part| part.split_once("%]"))
        .find_map(|(number, _)| number.parse::<u8>().ok());
    let on = if text.contains("[on]") {
        true
    } else if text.contains("[off]") {
        false
    } else {
        return Err("Receiver mixer switch unavailable.".into());
    };
    if percent.is_some_and(|value| value > 100) {
        return Err("Invalid receiver mixer level.".into());
    }
    Ok((percent.unwrap_or(0), on))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Receiver {
    volume: u8,
    mute: bool,
    mic_gain: u8,
    mic_mute: bool,
    auto_gain: bool,
}
#[derive(Serialize)]
struct Output {
    id: String,
    name: String,
    receiver: bool,
    transport: &'static str,
    brand: Option<&'static str>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    outputs: Vec<Output>,
    active: bool,
    target: Option<String>,
    eq: Eq,
    receiver: Option<Receiver>,
    usb_device: Option<Usb>,
    default_output: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", deny_unknown_fields)]
pub enum Command {
    Start { target: String, eq: Eq },
    Eq { eq: Eq },
    Stop {},
    Volume { value: u8 },
    MicGain { value: u8 },
    Mute { value: bool },
    MicMute { value: bool },
    AutoGain { value: bool },
}
#[derive(Default)]
pub struct Audio {
    child: Option<Child>,
    directory: Option<TempDir>,
    previous_default: Option<String>,
    previous_streams: HashMap<u32, String>,
    node_id: Option<u64>,
    active: bool,
    target: Option<String>,
    eq: Eq,
    error: Option<String>,
    known_sinks: Option<HashSet<String>>,
    modaliases: HashMap<String, Option<String>>,
}
/// Brands recognized from a Bluetooth Modalias. Each entry is a full identifier read from a device the project tests.
fn brand_for_modalias(modalias: &str) -> Option<&'static str> {
    match modalias {
        "bluetooth:v05D6p000Ad0240" => Some("redragon"),
        _ => None,
    }
}
fn valid_address(address: &str) -> bool {
    address.len() == 17
        && address.bytes().enumerate().all(|(index, byte)| {
            if index % 3 == 2 {
                byte == b':'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}
fn bluetooth_modalias(address: &str) -> Option<String> {
    command("bluetoothctl", &["info", address])
        .ok()?
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("Modalias:")
                .map(|value| value.trim().to_string())
        })
}
/// A USB or Bluetooth output that was not in the previous poll.
fn new_device(known: &HashSet<String>, sinks: &[Sink]) -> Option<String> {
    sinks
        .iter()
        .filter(|sink| !known.contains(&sink.name) && !sink.name.starts_with(SINK))
        .find(|sink| matches!(transport(sink), "usb" | "bluetooth"))
        .map(|sink| sink.name.clone())
}
impl Audio {
    pub fn is_active(&self) -> bool {
        self.active
    }
    pub fn monitor(&mut self) -> Result<()> {
        let sinks = sinks()?;
        if let (Some(known), false) = (&self.known_sinks, self.active) {
            if let Some(name) = new_device(known, &sinks) {
                if command("pactl", &["set-default-sink", &name]).is_err() {
                    self.error = Some("The new audio output could not be selected.".into());
                }
            }
        }
        self.known_sinks = Some(sinks.iter().map(|sink| sink.name.clone()).collect());
        if !self.active {
            return Ok(());
        }
        let exited = self
            .child
            .as_mut()
            .map(|child| child.try_wait())
            .transpose()
            .map_err(|_| "EQ process check failed.")?
            .flatten()
            .is_some();
        let gone = !sinks
            .iter()
            .any(|sink| Some(&sink.name) == self.target.as_ref());
        if exited || gone {
            self.stop()?;
            self.error=Some("The audio output or EQ process disconnected. Select an output and enable EQ again.".into());
        }
        Ok(())
    }
    pub fn snapshot(&mut self) -> Result<Snapshot> {
        if !cfg!(target_os = "linux") {
            return Err("Desktop audio currently supports Linux with PipeWire. Windows and macOS support is not implemented.".into());
        }
        self.monitor()?;
        let mut outputs = Vec::new();
        for sink in sinks()?
            .into_iter()
            .filter(|sink| sink.name != SINK && !sink.name.starts_with(&format!("{SINK}.")))
        {
            let transport = transport(&sink);
            let receiver = sink
                .properties
                .get("device.vendor.id")
                .and_then(Value::as_str)
                .is_some_and(|id| id.contains("3206"))
                && sink
                    .properties
                    .get("device.product.id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| id.contains("0881"));
            let brand = match sink
                .properties
                .get("api.bluez5.address")
                .and_then(Value::as_str)
            {
                Some(address) if transport == "bluetooth" && valid_address(address) => self
                    .modaliases
                    .entry(address.to_string())
                    .or_insert_with(|| bluetooth_modalias(address))
                    .as_deref()
                    .and_then(brand_for_modalias),
                _ => None,
            };
            outputs.push(Output {
                id: sink.name,
                name: sink.description,
                receiver,
                transport,
                brand,
            });
        }
        let mut receiver = None;
        let mut usb_device = None;
        if let Some(card) = receiver_card() {
            match usb(&card) {
                Ok(device) => usb_device = Some(device),
                Err(error) => self.error = Some(error),
            }
            let values: Result<Vec<(u8, bool)>> = ["PCM", "Mic", "Auto Gain Control"]
                .iter()
                .map(|name| mixer(&command("amixer", &["-c", &card, "sget", name])?))
                .collect();
            match values {
                Ok(values) => {
                    receiver = Some(Receiver {
                        volume: values[0].0,
                        mute: !values[0].1,
                        mic_gain: values[1].0,
                        mic_mute: !values[1].1,
                        auto_gain: values[2].1,
                    })
                }
                Err(error) => self.error = Some(error),
            }
        }
        let default_output = command("pactl", &["get-default-sink"])
            .ok()
            .filter(|name| !name.starts_with(SINK));
        Ok(Snapshot {
            outputs,
            active: self.active,
            target: self.target.clone(),
            eq: self.eq.clone(),
            receiver,
            usb_device,
            default_output,
            error: self.error.clone(),
        })
    }
    pub fn apply(&mut self, input: Command) -> Result<Snapshot> {
        match input {
            Command::Start { target, eq } => {
                eq.validate()?;
                self.start(&target, eq)?;
            }
            Command::Stop {} => self.stop()?,
            Command::Eq { eq } => {
                eq.validate()?;
                let id = self
                    .node_id
                    .filter(|_| self.active)
                    .ok_or("Enable desktop EQ first.")?
                    .to_string();
                command(
                    "pw-cli",
                    &["set-param", &id, "Props", &eq.controls().to_string()],
                )?;
                self.eq = eq;
            }
            mixer_command => {
                let (name, value) = match mixer_command {
                    Command::Volume { value } | Command::MicGain { value } if value > 100 => {
                        return Err("Mixer levels must be between 0 and 100.".into())
                    }
                    Command::Volume { value } => ("PCM", format!("{value}%")),
                    Command::MicGain { value } => ("Mic", format!("{value}%")),
                    Command::Mute { value } => {
                        ("PCM", if value { "mute" } else { "unmute" }.into())
                    }
                    Command::MicMute { value } => {
                        ("Mic", if value { "nocap" } else { "cap" }.into())
                    }
                    Command::AutoGain { value } => {
                        ("Auto Gain Control", if value { "on" } else { "off" }.into())
                    }
                    _ => return Err("Unsupported receiver operation.".into()),
                };
                let card = receiver_card().ok_or("Attach the H858 USB receiver first.")?;
                command("amixer", &["-c", &card, "sset", name, &value])?;
            }
        }
        self.error = None;
        self.snapshot()
    }
    fn start(&mut self, target: &str, eq: Eq) -> Result<()> {
        if target.len() > 512
            || !sinks()?
                .iter()
                .any(|sink| sink.name == target && sink.name != SINK)
        {
            return Err("Select an available audio output.".into());
        }
        if !self.active && sinks()?.iter().any(|sink| sink.name == SINK) {
            return Err(
                "Another Openear EQ is running. Disable it before enabling desktop EQ here.".into(),
            );
        }
        self.stop()?;
        self.previous_default = Some(command("pactl", &["get-default-sink"])?);
        let outputs = sinks()?;
        for stream in streams()? {
            if let Some(output) = outputs.iter().find(|sink| sink.index == stream.sink) {
                self.previous_streams
                    .insert(stream.index, output.name.clone());
            }
        }
        let result = (|| {
            let directory = tempfile::Builder::new()
                .prefix("openear-eq-")
                .tempdir()
                .map_err(|_| "Could not create private audio configuration.")?;
            let path = directory.path().join("filter.conf");
            fs::write(&path, eq.graph(target).to_string())
                .map_err(|_| "Could not write audio configuration.")?;
            self.directory = Some(directory);
            self.child = Some(
                Process::new("pipewire")
                    .arg("-c")
                    .arg(path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|_| "PipeWire filter-chain is unavailable.")?,
            );
            let mut found = false;
            for _ in 0..40 {
                if sinks()?.iter().any(|sink| sink.name == SINK) {
                    found = true;
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if !found {
                return Err("PipeWire could not create the EQ output.".into());
            }
            let nodes: Value = serde_json::from_str(&command("pw-dump", &[])?)
                .map_err(|_| "Invalid PipeWire response.")?;
            self.node_id = nodes
                .as_array()
                .and_then(|nodes| {
                    nodes.iter().find(|node| {
                        node["type"] == "PipeWire:Interface:Node"
                            && node["info"]["props"]["node.name"] == SINK
                    })
                })
                .and_then(|node| node["id"].as_u64());
            if self.node_id.is_none() {
                return Err("EQ control node unavailable.".into());
            }
            command("pactl", &["set-default-sink", SINK])?;
            for stream in streams()? {
                if stream.properties.get("node.name").and_then(Value::as_str)
                    == Some(&format!("{SINK}.output"))
                {
                    continue;
                }
                if command(
                    "pactl",
                    &["move-sink-input", &stream.index.to_string(), SINK],
                )
                .is_err()
                    && streams()?
                        .iter()
                        .any(|current| current.index == stream.index)
                {
                    return Err("A playback stream could not be routed through EQ.".into());
                }
            }
            self.target = Some(target.into());
            self.eq = eq;
            self.active = true;
            Ok(())
        })();
        if result.is_err() {
            let _ = self.stop();
        }
        result
    }
    pub fn stop(&mut self) -> Result<()> {
        if self.child.is_none() && self.previous_default.is_none() {
            return Ok(());
        }
        let result = (|| {
            let available = sinks()?;
            let fallback = available
                .iter()
                .find(|sink| Some(&sink.name) == self.previous_default.as_ref())
                .or_else(|| available.iter().find(|sink| sink.name != SINK));
            if let Some(fallback) = fallback {
                if command("pactl", &["get-default-sink"])? == SINK {
                    command("pactl", &["set-default-sink", &fallback.name])?;
                }
                let eq_sink = available
                    .iter()
                    .find(|sink| sink.name == SINK)
                    .map(|sink| sink.index);
                for stream in streams()? {
                    if Some(stream.sink) != eq_sink {
                        continue;
                    }
                    let original = self.previous_streams.get(&stream.index);
                    let destination = available
                        .iter()
                        .find(|sink| Some(&sink.name) == original)
                        .unwrap_or(fallback);
                    let _ = command(
                        "pactl",
                        &[
                            "move-sink-input",
                            &stream.index.to_string(),
                            &destination.name,
                        ],
                    );
                }
            }
            Ok(())
        })();
        self.active = false;
        self.target = None;
        self.node_id = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.directory = None;
        self.previous_default = None;
        self.previous_streams.clear();
        result
    }
}
impl Drop for Audio {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_only_newly_connected_usb_or_bluetooth_outputs() {
        let sink = |name: &str, bus: Option<&str>| Sink {
            index: 0,
            name: name.into(),
            description: String::new(),
            properties: bus
                .map(|bus| HashMap::from([("device.bus".to_string(), Value::from(bus))]))
                .unwrap_or_default(),
        };
        let known: HashSet<String> = ["alsa_output.pci".to_string()].into();
        let sinks = [
            sink("alsa_output.pci", None),
            sink("alsa_output.hdmi", None),
            sink(SINK, Some("usb")),
            sink("bluez_output.88_92.1", None),
        ];
        assert_eq!(
            new_device(&known, &sinks).as_deref(),
            Some("bluez_output.88_92.1")
        );
        assert_eq!(new_device(&known, &sinks[..2]), None);
    }
    #[test]
    fn recognizes_bluetooth_brand_from_full_modalias_only() {
        assert_eq!(
            brand_for_modalias("bluetooth:v05D6p000Ad0240"),
            Some("redragon")
        );
        assert_eq!(brand_for_modalias("bluetooth:v05D6p0001d0240"), None);
        assert!(valid_address("77:35:D9:7D:14:7B"));
        assert!(!valid_address("77-35-D9-7D-14-7B"));
        assert!(!valid_address("77:35:D9:7D:14:7B; rm -rf /"));
    }
    #[test]
    fn classifies_output_transport() {
        let sink = |name: &str, bus: Option<&str>| Sink {
            index: 0,
            name: name.into(),
            description: String::new(),
            properties: bus
                .map(|bus| HashMap::from([("device.bus".to_string(), Value::from(bus))]))
                .unwrap_or_default(),
        };
        assert_eq!(transport(&sink("bluez_output.88_92.1", None)), "bluetooth");
        assert_eq!(
            transport(&sink("alsa_output.x", Some("bluetooth"))),
            "bluetooth"
        );
        assert_eq!(transport(&sink("alsa_output.usb", Some("usb"))), "usb");
        assert_eq!(transport(&sink("alsa_output.pci", None)), "other");
    }
    #[test]
    fn rejects_unknown_and_malformed_commands() {
        for payload in [
            r#"{"operation":"shell","command":"anything"}"#,
            r#"{"operation":"stop","extra":true}"#,
            r#"{"operation":"mute","value":"yes"}"#,
            r#"{"operation":"volume","value":-1}"#,
        ] {
            assert!(
                serde_json::from_str::<Command>(payload).is_err(),
                "Accepted invalid fixture: {payload}"
            );
        }
        assert!(Audio::default()
            .apply(Command::Volume { value: 101 })
            .is_err());
        assert!(Audio::default()
            .apply(Command::Start {
                target: "invalid".into(),
                eq: Eq {
                    enabled: true,
                    bands: [f64::INFINITY; 10]
                }
            })
            .is_err());
    }
    #[test]
    fn decodes_mixer_switches_and_rejects_invalid_payloads() {
        assert_eq!(mixer("Mono: 20 [25%] [on]").unwrap(), (25, true));
        assert_eq!(mixer("Mono: [off]").unwrap(), (0, false));
        assert!(mixer("Mono: [invalid]").is_err());
        assert!(mixer("Mono: [101%] [on]").is_err());
    }
    #[test]
    #[ignore = "Requires local PipeWire and H858 receiver; briefly routes desktop playback"]
    fn physical_receiver_and_routing_round_trip() {
        let mut audio = Audio::default();
        let snapshot = audio.snapshot().unwrap();
        assert_eq!(snapshot.usb_device.unwrap().vendor_id, "3206");
        let receiver = snapshot.receiver.unwrap();
        for input in [
            Command::Volume {
                value: receiver.volume,
            },
            Command::Mute {
                value: receiver.mute,
            },
            Command::MicGain {
                value: receiver.mic_gain,
            },
            Command::MicMute {
                value: receiver.mic_mute,
            },
            Command::AutoGain {
                value: receiver.auto_gain,
            },
        ] {
            let actual = audio.apply(input).unwrap().receiver.unwrap();
            assert_eq!(
                (
                    actual.volume,
                    actual.mute,
                    actual.mic_gain,
                    actual.mic_mute,
                    actual.auto_gain
                ),
                (
                    receiver.volume,
                    receiver.mute,
                    receiver.mic_gain,
                    receiver.mic_mute,
                    receiver.auto_gain
                )
            );
        }
        let before = command("pactl", &["get-default-sink"]).unwrap();
        assert!(
            audio
                .apply(Command::Start {
                    target: before.clone(),
                    eq: Eq::default()
                })
                .unwrap()
                .active
        );
        assert_eq!(command("pactl", &["get-default-sink"]).unwrap(), SINK);
        let mut eq = Eq::default();
        eq.bands[5] = -3.;
        assert_eq!(audio.apply(Command::Eq { eq }).unwrap().eq.bands[5], -3.);
        assert!(!audio.apply(Command::Stop {}).unwrap().active);
        assert_eq!(command("pactl", &["get-default-sink"]).unwrap(), before);
    }
}
