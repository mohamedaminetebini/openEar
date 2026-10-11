use crate::audio::{command, command_within, Result};
use serde::Serialize;
use std::{collections::HashSet, time::Duration};

pub(crate) fn brand_for_modalias(modalias: &str) -> Option<&'static str> {
    match modalias {
        "bluetooth:v05D6p000Ad0240" => Some("redragon"),
        _ => None,
    }
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
pub(crate) fn bluetooth_modalias(address: &str) -> Option<String> {
    command("bluetoothctl", &["info", address])
        .ok()?
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("Modalias:")
                .map(|value| value.trim().to_string())
        })
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
