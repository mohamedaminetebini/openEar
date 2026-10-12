use crate::aap::{self, NoiseMode};
use crate::bluetooth::{
    bluetooth_battery, bluetooth_identity, connect_headset, is_paired, paired_devices,
    valid_address, Identity, NoiseKind, PairedDevice,
};
use crate::eq::{is_eq_node, Eq, SINK, SINK_ALT};
use crate::soundcore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::Path,
    process::{Child, Command as Process, Stdio},
    thread,
    time::Duration,
};
use tempfile::TempDir;
use wait_timeout::ChildExt;

pub(crate) type Result<T> = std::result::Result<T, String>;
pub(crate) fn command(name: &str, args: &[&str]) -> Result<String> {
    command_within(name, args, Duration::from_secs(5))
}
pub(crate) fn command_within(name: &str, args: &[&str], limit: Duration) -> Result<String> {
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
    let status = match child.wait_timeout(limit) {
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
    #[serde(default)]
    volume: HashMap<String, Value>,
}
fn sink_volume(sink: &Sink) -> Option<u8> {
    sink.volume
        .values()
        .next()?
        .get("value_percent")?
        .as_str()?
        .trim_end_matches('%')
        .trim()
        .parse::<u32>()
        .ok()
        .map(|value| value.min(100) as u8)
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
    #[serde(rename = "noiseControl")]
    noise_control: bool,
    battery: Option<u8>,
    address: Option<String>,
    volume: Option<u8>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoiseState {
    address: String,
    mode: NoiseMode,
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
    paired_devices: Vec<PairedDevice>,
    noise: Option<NoiseState>,
    error: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", deny_unknown_fields)]
pub enum Command {
    Start {
        target: String,
        eq: Eq,
    },
    Eq {
        eq: Eq,
    },
    Stop {},
    Volume {
        value: u8,
    },
    MicGain {
        value: u8,
    },
    Mute {
        value: bool,
    },
    MicMute {
        value: bool,
    },
    AutoGain {
        value: bool,
    },
    Connect {
        address: String,
    },
    OutputVolume {
        output: String,
        value: u8,
    },
    Noise {
        address: String,
        mode: Option<NoiseMode>,
    },
}
#[derive(Default)]
pub struct Audio {
    child: Option<Child>,
    directory: Option<TempDir>,
    previous_default: Option<String>,
    previous_streams: HashMap<u32, String>,
    node_id: Option<u64>,
    filter_sink: Option<&'static str>,
    active: bool,
    target: Option<String>,
    eq: Eq,
    error: Option<String>,
    known_sinks: Option<HashSet<String>>,
    identities: HashMap<String, Identity>,
    noise: Option<NoiseState>,
    noise_session: Option<NoiseSession>,
}
enum NoiseSession {
    Aap(aap::Session),
    Soundcore(soundcore::Session),
}
impl NoiseSession {
    fn open(kind: NoiseKind, address: &str) -> Result<Self> {
        Ok(match kind {
            NoiseKind::Aap => NoiseSession::Aap(aap::Session::open(address)?),
            NoiseKind::Soundcore => NoiseSession::Soundcore(soundcore::Session::open(address)?),
        })
    }
    fn address(&self) -> &str {
        match self {
            NoiseSession::Aap(session) => &session.address,
            NoiseSession::Soundcore(session) => &session.address,
        }
    }
    fn mode(&mut self, mode: Option<NoiseMode>) -> Result<NoiseMode> {
        match (self, mode) {
            (NoiseSession::Aap(session), Some(mode)) => session.set_mode(mode),
            (NoiseSession::Aap(session), None) => session.read_mode(),
            (NoiseSession::Soundcore(session), Some(mode)) => session.set_mode(mode),
            (NoiseSession::Soundcore(session), None) => session.read_mode(),
        }
    }
}
fn new_device(known: &HashSet<String>, sinks: &[Sink]) -> Option<String> {
    sinks
        .iter()
        .filter(|sink| !known.contains(&sink.name) && !is_eq_node(&sink.name))
        .find(|sink| matches!(transport(sink), "usb" | "bluetooth"))
        .map(|sink| sink.name.clone())
}
impl Audio {
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
        let mut connected = HashSet::new();
        for sink in sinks()?.into_iter().filter(|sink| !is_eq_node(&sink.name)) {
            let transport = transport(&sink);
            let volume = sink_volume(&sink);
            if let Some(address) = sink
                .properties
                .get("api.bluez5.address")
                .and_then(Value::as_str)
            {
                connected.insert(address.to_string());
            }
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
            let identity = match sink
                .properties
                .get("api.bluez5.address")
                .and_then(Value::as_str)
            {
                Some(address) if transport == "bluetooth" && valid_address(address) => *self
                    .identities
                    .entry(address.to_string())
                    .or_insert_with(|| bluetooth_identity(address)),
                _ => Identity::default(),
            };
            let battery = match sink
                .properties
                .get("api.bluez5.address")
                .and_then(Value::as_str)
            {
                Some(address) if transport == "bluetooth" && valid_address(address) => {
                    bluetooth_battery(address)
                }
                _ => None,
            };
            outputs.push(Output {
                id: sink.name,
                name: sink.description,
                receiver,
                transport,
                brand: identity.brand,
                noise_control: identity.noise.is_some(),
                battery,
                volume,
                address: sink
                    .properties
                    .get("api.bluez5.address")
                    .and_then(Value::as_str)
                    .filter(|address| transport == "bluetooth" && valid_address(address))
                    .map(str::to_string),
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
            .filter(|name| !is_eq_node(name));
        Ok(Snapshot {
            outputs,
            active: self.active,
            target: self.target.clone(),
            eq: self.eq.clone(),
            receiver,
            usb_device,
            default_output,
            paired_devices: paired_devices(&connected),
            noise: self.noise.as_ref().map(|noise| NoiseState {
                address: noise.address.clone(),
                mode: noise.mode,
            }),
            error: self.error.clone(),
        })
    }
    fn set_output_volume(&mut self, output: &str, value: u8) -> Result<()> {
        if value > 100 {
            return Err("Output volume must be between 0 and 100.".into());
        }
        if is_eq_node(output) || !sinks()?.iter().any(|sink| sink.name == output) {
            return Err("Select an available audio output.".into());
        }
        command("pactl", &["set-sink-volume", output, &format!("{value}%")])?;
        Ok(())
    }
    fn set_noise(&mut self, address: &str, mode: Option<NoiseMode>) -> Result<()> {
        if !is_paired(address) {
            return Err("Select a paired headset first.".into());
        }
        let kind = bluetooth_identity(address)
            .noise
            .ok_or(soundcore::UNSUPPORTED)?;
        if self.noise_session.as_ref().map(NoiseSession::address) != Some(address) {
            self.noise_session = None;
            match NoiseSession::open(kind, address) {
                Ok(session) => self.noise_session = Some(session),
                Err(error) => {
                    if error == soundcore::UNSUPPORTED {
                        self.identities
                            .entry(address.to_string())
                            .or_insert_with(|| bluetooth_identity(address))
                            .noise = None;
                    }
                    return Err(error);
                }
            }
        }
        let result = match self.noise_session.as_mut() {
            Some(session) => session.mode(mode),
            None => Err("The headset is not connected.".into()),
        };
        match result {
            Ok(mode) => {
                self.noise = Some(NoiseState {
                    address: address.to_string(),
                    mode,
                });
                Ok(())
            }
            Err(error) => {
                self.noise_session = None;
                self.noise = None;
                Err(error)
            }
        }
    }
    pub fn apply(&mut self, input: Command) -> Result<Snapshot> {
        match input {
            Command::Start { target, eq } => {
                eq.validate()?;
                self.start(&target, eq)?;
            }
            Command::Stop {} => self.stop()?,
            Command::Connect { address } => connect_headset(&address)?,
            Command::OutputVolume { output, value } => self.set_output_volume(&output, value)?,
            Command::Noise { address, mode } => self.set_noise(&address, mode)?,
            Command::Eq { eq } => {
                eq.validate()?;
                if eq.shape != self.eq.shape {
                    self.switch_filter(eq)?;
                    self.error = None;
                    return self.snapshot();
                }
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
                let card = receiver_card().ok_or("Attach a supported USB receiver first.")?;
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
                .any(|sink| sink.name == target && !is_eq_node(&sink.name))
        {
            return Err("Select an available audio output.".into());
        }
        if !self.active && sinks()?.iter().any(|sink| is_eq_node(&sink.name)) {
            self.recover_orphaned_eq()?;
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
            let (child, directory, node_id) = spawn_filter(&eq, target, SINK)?;
            self.child = Some(child);
            self.directory = Some(directory);
            self.node_id = Some(node_id);
            self.filter_sink = Some(SINK);
            command("pactl", &["set-default-sink", SINK])?;
            for stream in streams()? {
                if stream
                    .properties
                    .get("node.name")
                    .and_then(Value::as_str)
                    .is_some_and(is_eq_node)
                {
                    continue;
                }
                move_stream(stream.index, SINK)?;
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
    fn switch_filter(&mut self, eq: Eq) -> Result<()> {
        let target = self
            .target
            .clone()
            .filter(|_| self.active)
            .ok_or("Enable desktop EQ first.")?;
        let current = self.filter_sink.unwrap_or(SINK);
        let next = if current == SINK { SINK_ALT } else { SINK };
        let (mut child, directory, node_id) = spawn_filter(&eq, &target, next)?;
        let current_index = sink_index(current)?;
        let switched = (|| -> Result<()> {
            command("pactl", &["set-default-sink", next])?;
            move_streams(current_index, next)
        })();
        if let Err(error) = switched {
            let _ = command("pactl", &["set-default-sink", current]);
            let _ = move_streams(sink_index(next).ok().flatten(), current);
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        if let Some(mut old) = self.child.replace(child) {
            let _ = old.kill();
            let _ = old.wait();
        }
        self.directory = Some(directory);
        self.node_id = Some(node_id);
        self.filter_sink = Some(next);
        self.eq = eq;
        Ok(())
    }
    fn recover_orphaned_eq(&mut self) -> Result<()> {
        let available = sinks()?;
        let fallback = available
            .iter()
            .find(|sink| !is_eq_node(&sink.name))
            .ok_or("No audio output is available.")?;
        reroute_from_eq(&available, fallback, &HashMap::new())?;
        for pid in orphaned_filter_pids() {
            let pid = pid.to_string();
            let _ = command("kill", &["-CONT", &pid]);
            let _ = command("kill", &["-TERM", &pid]);
        }
        for _ in 0..40 {
            if !sinks()?.iter().any(|sink| is_eq_node(&sink.name)) {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err("Another Openear EQ is running. Disable it before enabling desktop EQ here.".into())
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
                .or_else(|| available.iter().find(|sink| !is_eq_node(&sink.name)));
            if let Some(fallback) = fallback {
                reroute_from_eq(&available, fallback, &self.previous_streams)?;
            }
            Ok(())
        })();
        self.active = false;
        self.target = None;
        self.node_id = None;
        self.filter_sink = None;
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
fn spawn_filter(eq: &Eq, target: &str, sink: &str) -> Result<(Child, TempDir, u64)> {
    let directory = tempfile::Builder::new()
        .prefix("openear-eq-")
        .tempdir()
        .map_err(|_| "Could not create private audio configuration.")?;
    let path = directory.path().join("filter.conf");
    fs::write(&path, eq.graph(target, sink).to_string())
        .map_err(|_| "Could not write audio configuration.")?;
    let mut child = Process::new("pipewire")
        .arg("-c")
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "PipeWire filter-chain is unavailable.")?;
    match filter_node_id(sink) {
        Ok(node_id) => Ok((child, directory, node_id)),
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(error)
        }
    }
}
fn filter_node_id(sink: &str) -> Result<u64> {
    let mut found = false;
    for _ in 0..40 {
        if sinks()?.iter().any(|candidate| candidate.name == sink) {
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
    nodes
        .as_array()
        .and_then(|nodes| {
            nodes.iter().find(|node| {
                node["type"] == "PipeWire:Interface:Node"
                    && node["info"]["props"]["node.name"] == sink
            })
        })
        .and_then(|node| node["id"].as_u64())
        .ok_or_else(|| "EQ control node unavailable.".into())
}
fn sink_index(name: &str) -> Result<Option<u32>> {
    Ok(sinks()?
        .iter()
        .find(|sink| sink.name == name)
        .map(|sink| sink.index))
}
fn move_stream(index: u32, to: &str) -> Result<()> {
    if command("pactl", &["move-sink-input", &index.to_string(), to]).is_err()
        && streams()?.iter().any(|current| current.index == index)
    {
        return Err("A playback stream could not be routed through EQ.".into());
    }
    Ok(())
}
fn move_streams(from: Option<u32>, to: &str) -> Result<()> {
    let Some(from) = from else {
        return Ok(());
    };
    for stream in streams()?.iter().filter(|stream| stream.sink == from) {
        move_stream(stream.index, to)?;
    }
    Ok(())
}
fn reroute_from_eq(
    available: &[Sink],
    fallback: &Sink,
    previous: &HashMap<u32, String>,
) -> Result<()> {
    if is_eq_node(&command("pactl", &["get-default-sink"])?) {
        command("pactl", &["set-default-sink", &fallback.name])?;
    }
    let eq_sink = available
        .iter()
        .find(|sink| is_eq_node(&sink.name))
        .map(|sink| sink.index);
    for stream in streams()? {
        if Some(stream.sink) != eq_sink {
            continue;
        }
        let original = previous.get(&stream.index);
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
    Ok(())
}
fn is_eq_filter_command(args: &[&str]) -> bool {
    match args {
        ["pipewire", "-c", path] => Path::new(path)
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|dir| dir.to_string_lossy().starts_with("openear-eq-")),
        _ => false,
    }
}
fn orphaned_filter_pids() -> Vec<u32> {
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let pid = entry.file_name().to_str()?.parse::<u32>().ok()?;
            let bytes = fs::read(entry.path().join("cmdline")).ok()?;
            let args = bytes
                .split(|byte| *byte == 0)
                .filter(|arg| !arg.is_empty())
                .map(std::str::from_utf8)
                .collect::<std::result::Result<Vec<&str>, _>>()
                .ok()?;
            is_eq_filter_command(&args).then_some(pid)
        })
        .collect()
}
impl Drop for Audio {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::bluetooth::{identity, parse_battery, parse_bluetooth_devices};
    #[test]
    fn selects_only_newly_connected_usb_or_bluetooth_outputs() {
        let sink = |name: &str, bus: Option<&str>| Sink {
            index: 0,
            name: name.into(),
            description: String::new(),
            properties: bus
                .map(|bus| HashMap::from([("device.bus".to_string(), Value::from(bus))]))
                .unwrap_or_default(),
            volume: HashMap::new(),
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
    fn recognizes_noise_control_and_brand_from_verified_identifiers() {
        assert_eq!(
            identity("\tModalias: bluetooth:v004Cp200Ed4C0F\n").noise,
            Some(NoiseKind::Aap)
        );
        let soundcore =
            identity("\tUUID: Vendor specific           (0cf12d31-fac3-4553-bd80-d6832e7b300b)\n");
        assert_eq!(soundcore.noise, Some(NoiseKind::Soundcore));
        assert_eq!(soundcore.brand, Some("soundcore"));
        assert_eq!(
            identity("\tModalias: bluetooth:v05D6p000Ad0240\n"),
            Identity::default()
        );
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
            volume: HashMap::new(),
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
    fn recognizes_only_this_apps_filter_process() {
        assert!(is_eq_filter_command(&[
            "pipewire",
            "-c",
            "/tmp/openear-eq-abc/filter.conf"
        ]));
        assert!(!is_eq_filter_command(&[
            "pipewire",
            "-c",
            "/tmp/other/filter.conf"
        ]));
        assert!(!is_eq_filter_command(&[
            "pipewire",
            "-c",
            "/home/user/filter.conf"
        ]));
        assert!(!is_eq_filter_command(&["pipewire"]));
    }
    #[test]
    fn reads_output_volume_from_pactl_json() {
        let sink: Sink = serde_json::from_str(
            r#"{"index":1,"name":"x","description":"x","volume":{"front-left":{"value":65536,"value_percent":"42%","db":"0.00 dB"}}}"#,
        )
        .unwrap();
        assert_eq!(sink_volume(&sink), Some(42));
        let loud: Sink = serde_json::from_str(
            r#"{"index":1,"name":"x","description":"x","volume":{"front-left":{"value_percent":"130%"}}}"#,
        )
        .unwrap();
        assert_eq!(sink_volume(&loud), Some(100));
    }
    #[test]
    fn parses_battery_percentage_from_bluetoothctl_info() {
        assert_eq!(parse_battery("\tBattery Percentage: 0x5a (90)\n"), Some(90));
        assert_eq!(parse_battery("Battery Percentage: 0x00 (0)"), Some(0));
        assert_eq!(parse_battery("Battery Percentage: 0x65 (101)"), None);
        assert_eq!(parse_battery("Name: headset"), None);
    }
    #[test]
    fn parses_paired_device_list_and_skips_malformed_lines() {
        let text = "Device 77:35:D9:7D:14:7B H858 \nDevice bad-address Ignored\nnot a device\nDevice AC:80:0A:22:96:78 WH-1000XM4\n";
        assert_eq!(
            parse_bluetooth_devices(text),
            vec![
                ("77:35:D9:7D:14:7B".to_string(), "H858".to_string()),
                ("AC:80:0A:22:96:78".to_string(), "WH-1000XM4".to_string()),
            ]
        );
    }
    #[test]
    fn rejects_connect_to_unpaired_address() {
        assert!(Audio::default()
            .apply(Command::Connect {
                address: "00:00:00:00:00:00".into()
            })
            .is_err());
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
                    bands: [f64::INFINITY; 10],
                    ..Eq::default()
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
    #[ignore = "Requires local PipeWire and a supported USB receiver; briefly routes desktop playback"]
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
