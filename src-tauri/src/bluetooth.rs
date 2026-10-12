use crate::audio::{command, command_within, Result};
use crate::soundcore;
use serde::Serialize;
use std::{collections::HashSet, time::Duration};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NoiseKind {
    Aap,
    Soundcore,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Identity {
    pub(crate) noise: Option<NoiseKind>,
    pub(crate) brand: Option<&'static str>,
}
pub(crate) fn identity(info: &str) -> Identity {
    let lines = || info.lines().map(str::trim);
    let soundcore = lines().any(|line| {
        line.starts_with("UUID:") && line.ends_with(&format!("({})", soundcore::SERVICE))
    });
    let noise = if lines().any(|line| line == "Modalias: bluetooth:v004Cp200Ed4C0F") {
        Some(NoiseKind::Aap)
    } else if soundcore {
        Some(NoiseKind::Soundcore)
    } else {
        None
    };
    Identity {
        noise,
        brand: soundcore.then_some("soundcore"),
    }
}
pub(crate) fn bluetooth_identity(address: &str) -> Identity {
    command("bluetoothctl", &["info", address])
        .map(|text| identity(&text))
        .unwrap_or_default()
}
pub(crate) fn valid_address(address: &str) -> bool {
    address.len() == 17
        && address.bytes().enumerate().all(|(index, byte)| {
            if index % 3 == 2 {
                byte == b':'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}
pub(crate) fn parse_battery(text: &str) -> Option<u8> {
    text.lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("Battery Percentage:"))
        .and_then(|value| {
            value
                .split('(')
                .nth(1)?
                .trim_end_matches(')')
                .parse::<u8>()
                .ok()
        })
        .filter(|level| *level <= 100)
}
pub(crate) fn bluetooth_battery(address: &str) -> Option<u8> {
    command("bluetoothctl", &["info", address])
        .ok()
        .and_then(|text| parse_battery(&text))
}
pub(crate) fn parse_bluetooth_devices(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix("Device ")?;
            let (address, name) = rest.split_once(' ').unwrap_or((rest, ""));
            valid_address(address).then(|| (address.to_string(), name.trim().to_string()))
        })
        .collect()
}
pub(crate) fn bluetooth_devices(filter: &str) -> Vec<(String, String)> {
    command("bluetoothctl", &["devices", filter])
        .map(|text| parse_bluetooth_devices(&text))
        .unwrap_or_default()
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    address: String,
    name: String,
}
pub(crate) fn paired_devices(connected_sinks: &HashSet<String>) -> Vec<PairedDevice> {
    let live: HashSet<String> = bluetooth_devices("Connected")
        .into_iter()
        .map(|(address, _)| address)
        .collect();
    bluetooth_devices("Paired")
        .into_iter()
        .filter(|(address, _)| !live.contains(address) && !connected_sinks.contains(address))
        .map(|(address, name)| PairedDevice {
            name: if name.is_empty() {
                address.clone()
            } else {
                name
            },
            address,
        })
        .collect()
}
pub(crate) fn is_paired(address: &str) -> bool {
    bluetooth_devices("Paired")
        .iter()
        .any(|(paired, _)| paired == address)
}
pub(crate) fn connect_headset(address: &str) -> Result<()> {
    if !is_paired(address) {
        return Err("Select a paired headset first.".into());
    }
    command("bluetoothctl", &["trust", address])?;
    let output = command_within(
        "bluetoothctl",
        &["connect", address],
        Duration::from_secs(20),
    )?;
    if output.contains("Connection successful") {
        Ok(())
    } else {
        Err("The headset did not connect. Turn it on and bring it near this computer.".into())
    }
}
