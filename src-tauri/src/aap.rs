use serde::{Deserialize, Serialize};
use std::{
    mem,
    time::{Duration, Instant},
};

const PSM: u16 = 0x1001;
const AF_BLUETOOTH: libc::c_int = 31;
const BTPROTO_L2CAP: libc::c_int = 0;
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

#[repr(C)]
struct SockaddrL2 {
    family: u16,
    psm: u16,
    bdaddr: [u8; 6],
    cid: u16,
    bdaddr_type: u8,
}

struct Channel(libc::c_int);

impl Channel {
    fn open(address: &str) -> Result<Self, String> {
        let fd = unsafe { libc::socket(AF_BLUETOOTH, libc::SOCK_SEQPACKET, BTPROTO_L2CAP) };
        if fd < 0 {
            return Err("Bluetooth is unavailable.".into());
        }
        let channel = Channel(fd);
        let mut bdaddr = [0u8; 6];
        for (slot, part) in bdaddr.iter_mut().zip(address.split(':').rev()) {
            *slot = u8::from_str_radix(part, 16).map_err(|_| "Invalid headset address.")?;
        }
        let target = SockaddrL2 {
            family: AF_BLUETOOTH as u16,
            psm: PSM.to_le(),
            bdaddr,
            cid: 0,
            bdaddr_type: 0,
        };
        let connected = unsafe {
            libc::connect(
                fd,
                &target as *const SockaddrL2 as *const libc::sockaddr,
                mem::size_of::<SockaddrL2>() as libc::socklen_t,
            )
        };
        if connected != 0 {
            return Err("The headset is not connected. Connect it and try again.".into());
        }
        let timeout = libc::timeval {
            tv_sec: 0,
            tv_usec: 500_000,
        };
        unsafe {
            libc::setsockopt(
                fd,
                libc::SOL_SOCKET,
                libc::SO_RCVTIMEO,
                &timeout as *const libc::timeval as *const libc::c_void,
                mem::size_of::<libc::timeval>() as libc::socklen_t,
            );
        }
        Ok(channel)
    }

    fn send(&self, packet: &[u8]) -> Result<(), String> {
        let sent = unsafe { libc::send(self.0, packet.as_ptr().cast(), packet.len(), 0) };
        if sent == packet.len() as isize {
            Ok(())
        } else {
            Err("The headset did not accept the command.".into())
        }
    }

    fn recv(&self) -> Option<Vec<u8>> {
        let mut buffer = [0u8; 256];
        let received = unsafe { libc::recv(self.0, buffer.as_mut_ptr().cast(), buffer.len(), 0) };
        (received > 0).then(|| buffer[..received as usize].to_vec())
    }
}

impl Drop for Channel {
    fn drop(&mut self) {
        unsafe {
            libc::close(self.0);
        }
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
            channel: Channel::open(address)?,
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
