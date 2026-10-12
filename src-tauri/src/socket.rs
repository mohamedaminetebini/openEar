use std::{io, mem, thread, time::Duration};

const AF_BLUETOOTH: libc::c_int = 31;
const BTPROTO_L2CAP: libc::c_int = 0;
const BTPROTO_RFCOMM: libc::c_int = 3;
const CONNECT_ATTEMPTS: u32 = 3;
const RETRY_DELAY: Duration = Duration::from_millis(500);

#[repr(C)]
struct SockaddrL2 {
    family: u16,
    psm: u16,
    bdaddr: [u8; 6],
    cid: u16,
    bdaddr_type: u8,
}

#[repr(C)]
struct SockaddrRc {
    family: u16,
    bdaddr: [u8; 6],
    channel: u8,
}

pub(crate) struct Channel(libc::c_int);

fn bdaddr(address: &str) -> Result<[u8; 6], String> {
    let mut bdaddr = [0u8; 6];
    let mut parts = 0;
    for (slot, part) in bdaddr.iter_mut().zip(address.split(':').rev()) {
        *slot = u8::from_str_radix(part, 16).map_err(|_| "Invalid headset address.")?;
        parts += 1;
    }
    if parts == 6 {
        Ok(bdaddr)
    } else {
        Err("Invalid headset address.".into())
    }
}

fn connect_error(error: io::Error) -> String {
    match error.raw_os_error() {
        Some(libc::ETIMEDOUT | libc::EAGAIN | libc::EINPROGRESS) => {
            "The headset did not answer. Try again.".into()
        }
        Some(
            libc::ECONNREFUSED
            | libc::EHOSTDOWN
            | libc::EHOSTUNREACH
            | libc::ENODEV
            | libc::ENOTCONN,
        ) => "The headset is not connected. Connect it and try again.".into(),
        _ => format!("Could not reach the headset: {error}."),
    }
}

fn set_timeout(fd: libc::c_int, option: libc::c_int, timeout: libc::timeval) {
    unsafe {
        libc::setsockopt(
            fd,
            libc::SOL_SOCKET,
            option,
            &timeout as *const libc::timeval as *const libc::c_void,
            mem::size_of::<libc::timeval>() as libc::socklen_t,
        );
    }
}

impl Channel {
    pub(crate) fn l2cap(address: &str, psm: u16) -> Result<Self, String> {
        let target = SockaddrL2 {
            family: AF_BLUETOOTH as u16,
            psm: psm.to_le(),
            bdaddr: bdaddr(address)?,
            cid: 0,
            bdaddr_type: 0,
        };
        Self::connect(libc::SOCK_SEQPACKET, BTPROTO_L2CAP, &target)
    }

    pub(crate) fn rfcomm(address: &str, channel: u8) -> Result<Self, String> {
        let target = SockaddrRc {
            family: AF_BLUETOOTH as u16,
            bdaddr: bdaddr(address)?,
            channel,
        };
        Self::connect(libc::SOCK_STREAM, BTPROTO_RFCOMM, &target)
    }

    fn connect<T>(kind: libc::c_int, protocol: libc::c_int, target: &T) -> Result<Self, String> {
        let mut failure = String::new();
        for attempt in 0..CONNECT_ATTEMPTS {
            if attempt > 0 {
                thread::sleep(RETRY_DELAY);
            }
            match Self::connect_once(kind, protocol, target) {
                Ok(channel) => return Ok(channel),
                Err(error) => failure = error,
            }
        }
        Err(failure)
    }

    fn connect_once<T>(
        kind: libc::c_int,
        protocol: libc::c_int,
        target: &T,
    ) -> Result<Self, String> {
        let fd = unsafe { libc::socket(AF_BLUETOOTH, kind, protocol) };
        if fd < 0 {
            return Err("Bluetooth is unavailable.".into());
        }
        let channel = Channel(fd);
        set_timeout(
            fd,
            libc::SO_SNDTIMEO,
            libc::timeval {
                tv_sec: 3,
                tv_usec: 0,
            },
        );
        let connected = unsafe {
            libc::connect(
                fd,
                target as *const T as *const libc::sockaddr,
                mem::size_of::<T>() as libc::socklen_t,
            )
        };
        if connected != 0 {
            return Err(connect_error(io::Error::last_os_error()));
        }
        set_timeout(
            fd,
            libc::SO_RCVTIMEO,
            libc::timeval {
                tv_sec: 0,
                tv_usec: 500_000,
            },
        );
        Ok(channel)
    }

    pub(crate) fn send(&self, packet: &[u8]) -> Result<(), String> {
        let sent = unsafe { libc::send(self.0, packet.as_ptr().cast(), packet.len(), 0) };
        if sent == packet.len() as isize {
            Ok(())
        } else {
            Err("The headset did not accept the command.".into())
        }
    }

    pub(crate) fn recv(&self) -> Option<Vec<u8>> {
        let mut buffer = [0u8; 1024];
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explains_connect_failures() {
        assert_eq!(
            connect_error(io::Error::from_raw_os_error(libc::ETIMEDOUT)),
            "The headset did not answer. Try again."
        );
        assert_eq!(
            connect_error(io::Error::from_raw_os_error(libc::ECONNREFUSED)),
            "The headset is not connected. Connect it and try again."
        );
    }

    #[test]
    fn parses_addresses_in_bluez_byte_order() {
        assert_eq!(
            bdaddr("B0:38:E2:5B:7E:78"),
            Ok([0x78, 0x7e, 0x5b, 0xe2, 0x38, 0xb0])
        );
        assert!(bdaddr("B0:38:E2:5B:7E").is_err());
        assert!(bdaddr("B0:38:E2:5B:7E:ZZ").is_err());
    }
}
