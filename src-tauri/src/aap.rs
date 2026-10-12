use crate::socket::Channel;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const PSM: u16 = 0x1001;
const HEADER: [u8; 7] = [0x04, 0x00, 0x04, 0x00, 0x09, 0x00, 0x0d];
const WAIT: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoiseMode {
    Off,
    NoiseCancellation,
    Transparency,
}

impl NoiseMode {
    fn code(self) -> u8 {
        match self {
            NoiseMode::Off => 0x01,
            NoiseMode::NoiseCancellation => 0x02,
            NoiseMode::Transparency => 0x03,
        }
    }
    fn from_code(code: u8) -> Option<Self> {
        match code {
            0x01 => Some(NoiseMode::Off),
            0x02 => Some(NoiseMode::NoiseCancellation),
            0x03 => Some(NoiseMode::Transparency),
            _ => None,
        }
    }
}

fn mode_packet(mode: NoiseMode) -> [u8; 11] {
    let mut packet = [0u8; 11];
    packet[..7].copy_from_slice(&HEADER);
    packet[7] = mode.code();
    packet
}

fn parse_status(packet: &[u8]) -> Option<NoiseMode> {
    if packet.len() == 11 && packet[..7] == HEADER {
        NoiseMode::from_code(packet[7])
    } else {
        None
    }
}

pub struct Session {
    pub(crate) address: String,
    channel: Channel,
    last: Option<NoiseMode>,
}

impl Session {
    pub fn open(address: &str) -> Result<Self, String> {
        Ok(Session {
            address: address.to_string(),
            channel: Channel::l2cap(address, PSM)?,
            last: None,
        })
    }
    pub fn read_mode(&mut self) -> Result<NoiseMode, String> {
        if self.last.is_none() {
            self.wait_for(|_| true);
        }
        self.last
            .ok_or_else(|| "The headset did not report its noise mode.".to_string())
    }
    pub fn set_mode(&mut self, mode: NoiseMode) -> Result<NoiseMode, String> {
        self.channel.send(&mode_packet(mode))?;
        self.wait_for(|reported| reported == mode)
            .ok_or_else(|| "The headset did not confirm the noise mode.".to_string())
    }
    fn wait_for(&mut self, accept: impl Fn(NoiseMode) -> bool) -> Option<NoiseMode> {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline {
            let Some(packet) = self.channel.recv() else {
                continue;
            };
            if let Some(mode) = parse_status(&packet) {
                self.last = Some(mode);
                if accept(mode) {
                    return Some(mode);
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_mode_packets_with_the_confirmed_bytes() {
        assert_eq!(
            mode_packet(NoiseMode::Off),
            [0x04, 0x00, 0x04, 0x00, 0x09, 0x00, 0x0d, 0x01, 0x00, 0x00, 0x00]
        );
        assert_eq!(mode_packet(NoiseMode::Transparency)[7], 0x03);
        assert_eq!(mode_packet(NoiseMode::NoiseCancellation)[7], 0x02);
    }

    #[test]
    fn parses_only_well_formed_status_packets() {
        assert_eq!(
            parse_status(&[0x04, 0x00, 0x04, 0x00, 0x09, 0x00, 0x0d, 0x03, 0x00, 0x00, 0x00]),
            Some(NoiseMode::Transparency)
        );
        assert_eq!(
            parse_status(&[0x04, 0x00, 0x04, 0x00, 0x06, 0x00, 0x00, 0x00]),
            None
        );
        assert_eq!(
            parse_status(&[0x04, 0x00, 0x04, 0x00, 0x09, 0x00, 0x0d, 0x09, 0x00, 0x00, 0x00]),
            None
        );
    }
}
