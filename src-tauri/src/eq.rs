use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SINK: &str = "openear.system-eq";
pub const SINK_ALT: &str = "openear.system-eq-2";

pub fn is_eq_node(name: &str) -> bool {
    [SINK, SINK_ALT].into_iter().any(|sink| {
        name == sink
            || name
                .strip_prefix(sink)
                .is_some_and(|rest| rest.starts_with('.'))
    })
}
const FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PEAKING_SAMPLE_RATE: f64 = 48_000.;
const PEAKING_Q: f64 = 1.41;
const PROBE_COUNT: usize = 512;
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Shape {
    #[default]
    Graphic,
    Peaking,
}
impl Shape {
    fn is_graphic(&self) -> bool {
        *self == Shape::Graphic
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Eq {
    pub enabled: bool,
    pub bands: [f64; 10],
    #[serde(default, skip_serializing_if = "Shape::is_graphic")]
    pub shape: Shape,
}
impl Default for Eq {
    fn default() -> Self {
        Self {
            enabled: true,
            bands: [0.; 10],
            shape: Shape::Graphic,
        }
    }
}
fn biquad_magnitude(coefficients: [f64; 3], w: f64) -> f64 {
    let [b0, b1, b2] = coefficients;
    let real = b0 + b1 * w.cos() + b2 * (2. * w).cos();
    let imaginary = -(b1 * w.sin() + b2 * (2. * w).sin());
    real.hypot(imaginary)
}
fn peaking_band_db(gain: f64, frequency: f64, w: f64) -> f64 {
    if gain == 0. {
        return 0.;
    }
    let amplitude = 10_f64.powf(gain / 40.);
    let w0 = 2. * std::f64::consts::PI * frequency / PEAKING_SAMPLE_RATE;
    let alpha = w0.sin() / (2. * PEAKING_Q);
    let cos0 = w0.cos();
    let numerator = [1. + alpha * amplitude, -2. * cos0, 1. - alpha * amplitude];
    let denominator = [1. + alpha / amplitude, -2. * cos0, 1. - alpha / amplitude];
    20. * (biquad_magnitude(numerator, w) / biquad_magnitude(denominator, w)).log10()
}
pub fn peaking_peak_db(bands: &[f64; 10]) -> f64 {
    (0..PROBE_COUNT)
        .map(|index| {
            let frequency = 20. * 1000_f64.powf(index as f64 / (PROBE_COUNT - 1) as f64);
            let w = 2. * std::f64::consts::PI * frequency / PEAKING_SAMPLE_RATE;
            FREQUENCIES
                .iter()
                .zip(bands)
                .map(|(band, gain)| peaking_band_db(*gain, *band as f64, w))
                .sum::<f64>()
        })
        .fold(0., f64::max)
}
impl Eq {
    pub fn validate(&self) -> Result<(), String> {
        if self
            .bands
            .iter()
            .any(|gain| !gain.is_finite() || !(-12.0..=12.0).contains(gain))
        {
            return Err("EQ gains must be between -12 and +12 dB.".into());
        }
        Ok(())
    }
    fn headroom(&self) -> f64 {
        if !self.enabled {
            return 1.;
        }
        let peak = match self.shape {
            Shape::Graphic => self.bands.iter().map(|gain| gain.max(0.)).sum(),
            Shape::Peaking => peaking_peak_db(&self.bands).max(0.),
        };
        10_f64.powf(-peak / 20.)
    }
    pub fn controls(&self) -> Value {
        let mut params = Vec::new();
        for (index, gain) in self.bands.iter().enumerate() {
            params.extend([
                json!(format!("eq{index}:Gain")),
                json!(if self.enabled { *gain } else { 0. }),
            ]);
        }
        params.extend([json!("preamp:Mult"), json!(self.headroom())]);
        json!({"params": params})
    }
    pub fn graph(&self, target: &str, sink: &str) -> Value {
        let mut nodes = vec![
            json!({"type":"builtin","name":"preamp","label":"linear","control":{"Mult":self.headroom(),"Add":0}}),
        ];
        let peaking = self.shape == Shape::Peaking;
        for (index, frequency) in FREQUENCIES.iter().enumerate() {
            let label = if peaking {
                "bq_peaking"
            } else if index == 0 {
                "bq_lowshelf"
            } else if index == 9 {
                "bq_highshelf"
            } else {
                "bq_peaking"
            };
            let q = if peaking { PEAKING_Q } else { 1.4 };
            nodes.push(json!({"type":"builtin","name":format!("eq{index}"),"label":label,"control":{"Freq":frequency,"Q":q,"Gain":if self.enabled {self.bands[index]} else {0.}}}));
        }
        let links: Vec<Value> = (0..10).map(|index| json!({"output":if index == 0 {"preamp:Out".into()} else {format!("eq{}:Out", index-1)},"input":format!("eq{index}:In")})).collect();
        json!({
            "context.properties":{"log.level":0},
            "context.spa-libs":{"audio.convert.*":"audioconvert/libspa-audioconvert","support.*":"support/libspa-support"},
            "context.modules":[
                {"name":"libpipewire-module-protocol-native"},
                {"name":"libpipewire-module-client-node"},
                {"name":"libpipewire-module-adapter"},
                {"name":"libpipewire-module-filter-chain","args":{
                    "node.description":"Openear System EQ","media.name":"Openear System EQ",
                    "filter.graph":{"nodes":nodes,"links":links,"inputs":["preamp:In"],"outputs":["eq9:Out"]},
                    "audio.channels":2,"audio.position":["FL","FR"],
                    "capture.props":{"node.name":sink,"node.description":"Openear System EQ","media.class":"Audio/Sink"},
                    "playback.props":{"node.name":format!("{sink}.output"),"node.passive":true,"target.object":target,"stream.dont-remix":true}
                }}
            ]
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_both_eq_sinks_and_their_outputs() {
        assert!(is_eq_node(SINK));
        assert!(is_eq_node(SINK_ALT));
        assert!(is_eq_node("openear.system-eq-2.output"));
        assert!(is_eq_node("openear.system-eq.output"));
        assert!(!is_eq_node("openear.system-equalizer"));
        assert!(!is_eq_node("alsa_output.pci-0000"));
    }

    #[test]
    fn validates_gain_and_stereo_graph_with_bypass() {
        let mut eq = Eq::default();
        eq.bands[0] = 6.;
        let graph = eq.graph("physical-output", SINK);
        let args = &graph["context.modules"][3]["args"];
        assert_eq!(args["filter.graph"]["nodes"].as_array().unwrap().len(), 11);
        assert_eq!(args["audio.channels"], 2);
        assert_eq!(args["playback.props"]["target.object"], "physical-output");
        assert!((eq.headroom() - 10_f64.powf(-6. / 20.)).abs() < 1e-8);
        assert_eq!(serde_json::to_value(&eq).unwrap().get("shape"), None);
        eq.enabled = false;
        assert_eq!(eq.headroom(), 1.);
        assert_eq!(eq.controls()["params"][1], 0.);
        eq.bands[1] = f64::NAN;
        assert!(eq.validate().is_err());
        assert!(serde_json::from_str::<Eq>(r#"{"enabled":true,"bands":[1]}"#).is_err());
    }
    #[test]
    fn peaking_headroom_follows_the_combined_response() {
        let mut bands = [0.; 10];
        bands[5] = 6.;
        assert!((peaking_peak_db(&bands) - 6.).abs() < 0.1);
        let eq = Eq {
            bands,
            shape: Shape::Peaking,
            ..Eq::default()
        };
        assert!((eq.headroom() - 10_f64.powf(-6. / 20.)).abs() < 0.001);
        let flat = Eq {
            shape: Shape::Peaking,
            ..Eq::default()
        };
        assert_eq!(flat.headroom(), 1.);
        let correction = [6.6, 4.6, -0.4, -1.9, -0.1, -0.1, 3.9, -1.4, -2.7, -7.5];
        assert!((peaking_peak_db(&correction) - 7.46).abs() < 0.01);
    }
    #[test]
    fn peaking_graph_uses_bell_filters_at_q_1_41() {
        let eq = Eq {
            shape: Shape::Peaking,
            ..Eq::default()
        };
        let graph = eq.graph("physical-output", SINK);
        let nodes = graph["context.modules"][3]["args"]["filter.graph"]["nodes"]
            .as_array()
            .unwrap();
        let bands = &nodes[1..];
        assert_eq!(bands.len(), 10);
        assert!(bands.iter().all(|node| node["label"] == "bq_peaking"));
        assert!(bands.iter().all(|node| node["control"]["Q"] == 1.41));
    }
    #[test]
    fn missing_shape_is_graphic_and_is_not_serialized() {
        let eq: Eq =
            serde_json::from_str(r#"{"enabled":true,"bands":[0,0,0,0,0,0,0,0,0,0]}"#).unwrap();
        assert_eq!(eq.shape, Shape::Graphic);
        assert!(serde_json::to_value(&eq).unwrap().get("shape").is_none());
    }
}
