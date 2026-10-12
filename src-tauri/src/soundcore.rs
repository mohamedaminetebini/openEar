use crate::{aap::NoiseMode, socket::Channel};
use std::time::{Duration, Instant};

pub(crate) const SERVICE: &str = "0cf12d31-fac3-4553-bd80-d6832e7b300b";
const RFCOMM_CHANNEL: u8 = 10;
const OUTBOUND: [u8; 5] = [0x08, 0xee, 0x00, 0x00, 0x00];
const INBOUND: [u8; 5] = [0x09, 0xff, 0x00, 0x00, 0x01];
const STATE: [u8; 2] = [0x01, 0x01];
const SET_MODE: [u8; 2] = [0x06, 0x81];
const MODEL: &[u8] = b"3004";
const SERIAL: std::ops::Range<usize> = 7..23;
const MODE: usize = 35;
const WAIT: Duration = Duration::from_secs(3);
pub(crate) const UNSUPPORTED: &str = "This headset does not support noise control.";

fn checksum(bytes: &[u8]) -> u8 {
    bytes.iter().fold(0u8, |sum, byte| sum.wrapping_add(*byte))
}

fn packet(command: [u8; 2], payload: &[u8]) -> Vec<u8> {
    let length = (OUTBOUND.len() + 2 + 2 + payload.len() + 1) as u16;
    let mut packet = OUTBOUND.to_vec();
    packet.extend_from_slice(&command);
    packet.extend_from_slice(&length.to_le_bytes());
    packet.extend_from_slice(payload);
    packet.push(checksum(&packet));
    packet
}

fn mode_code(mode: NoiseMode) -> u8 {
    match mode {
        NoiseMode::NoiseCancellation => 0x00,
        NoiseMode::Transparency => 0x01,
        NoiseMode::Off => 0x02,
    }
}

fn mode_from_code(code: u8) -> Option<NoiseMode> {
    match code {
        0x00 => Some(NoiseMode::NoiseCancellation),
        0x01 => Some(NoiseMode::Transparency),
        0x02 => Some(NoiseMode::Off),
        _ => None,
    }
}

fn take_frame(buffer: &mut Vec<u8>) -> Option<([u8; 2], Vec<u8>)> {
    loop {
        let start = buffer
            .windows(INBOUND.len())
            .position(|window| window == INBOUND)?;
        buffer.drain(..start);
        if buffer.len() < 9 {
            return None;
        }
        let length = u16::from_le_bytes([buffer[7], buffer[8]]) as usize;
        if !(10..=1024).contains(&length) {
            buffer.drain(..1);
            continue;
        }
        if buffer.len() < length {
            return None;
        }
        let frame: Vec<u8> = buffer.drain(..length).collect();
        if checksum(&frame[..length - 1]) == frame[length - 1] {
            return Some(([frame[5], frame[6]], frame[9..length - 1].to_vec()));
        }
    }
}

fn parse_state(body: &[u8]) -> Result<NoiseMode, String> {
    if !body
        .get(SERIAL)
        .is_some_and(|serial| serial.starts_with(MODEL))
    {
        return Err(UNSUPPORTED.into());
    }
    body.get(MODE)
        .copied()
        .and_then(mode_from_code)
        .ok_or_else(|| "The headset did not report its noise mode.".into())
}

pub struct Session {
    pub(crate) address: String,
    channel: Channel,
    buffer: Vec<u8>,
}

impl Session {
    pub fn open(address: &str) -> Result<Self, String> {
        let mut session = Session {
            address: address.to_string(),
            channel: Channel::rfcomm(address, RFCOMM_CHANNEL)?,
            buffer: Vec::new(),
        };
        session.read_mode()?;
        Ok(session)
    }
    pub fn read_mode(&mut self) -> Result<NoiseMode, String> {
        self.channel.send(&packet(STATE, &[]))?;
        let body = self
            .wait_for(STATE)
            .ok_or("The headset did not report its noise mode.")?;
        parse_state(&body)
    }
    pub fn set_mode(&mut self, mode: NoiseMode) -> Result<NoiseMode, String> {
        self.channel
            .send(&packet(SET_MODE, &[mode_code(mode), 0x00, 0x00, 0x00]))?;
        self.wait_for(SET_MODE)
            .ok_or("The headset did not confirm the noise mode.")?;
        match self.read_mode()? {
            reported if reported == mode => Ok(reported),
            _ => Err("The headset did not confirm the noise mode.".into()),
        }
    }
    fn wait_for(&mut self, command: [u8; 2]) -> Option<Vec<u8>> {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline {
            while let Some((received, body)) = take_frame(&mut self.buffer) {
                if received == command {
                    return Some(body);
                }
            }
            if let Some(bytes) = self.channel.recv() {
                self.buffer.extend_from_slice(&bytes);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATE_REPLY: &str = "09 ff 00 00 01 01 01 47 00 04 00 30 30 2e 32 38 33 30 30 34 37 38 37 65 35 62 65 32 33 38 62 30 7e 7e 70 78 78 6f 6f 85 6d 78 00 00 02 ff ff 01 01 ff 01 31 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff 10";

    fn bytes(hex: &str) -> Vec<u8> {
        hex.split(' ')
            .map(|byte| u8::from_str_radix(byte, 16).unwrap())
            .collect()
    }

    #[test]
    fn builds_the_confirmed_packets() {
        assert_eq!(packet(STATE, &[]), bytes("08 ee 00 00 00 01 01 0a 00 02"));
        assert_eq!(
            packet(
                SET_MODE,
                &[mode_code(NoiseMode::NoiseCancellation), 0, 0, 0]
            ),
            bytes("08 ee 00 00 00 06 81 0e 00 00 00 00 00 8b")
        );
        assert_eq!(
            packet(SET_MODE, &[mode_code(NoiseMode::Transparency), 0, 0, 0]),
            bytes("08 ee 00 00 00 06 81 0e 00 01 00 00 00 8c")
        );
    }

    #[test]
    fn reads_the_mode_from_a_split_state_reply() {
        let reply = bytes(STATE_REPLY);
        let mut buffer = bytes("be 50 00 03 00 00 01 ed");
        buffer.extend_from_slice(&reply[..20]);
        assert_eq!(take_frame(&mut buffer), None);
        buffer.extend_from_slice(&reply[20..]);
        let (command, body) = take_frame(&mut buffer).unwrap();
        assert_eq!(command, STATE);
        assert_eq!(parse_state(&body), Ok(NoiseMode::Off));
        assert!(buffer.is_empty());
    }

    #[test]
    fn rejects_other_models_and_corrupt_frames() {
        let mut reply = bytes(STATE_REPLY);
        let (_, mut body) = take_frame(&mut reply.clone()).unwrap();
        body[SERIAL.start] = b'9';
        assert!(parse_state(&body).is_err());
        let last = reply.len() - 1;
        reply[last] ^= 0xff;
        assert_eq!(take_frame(&mut reply), None);
    }
}
