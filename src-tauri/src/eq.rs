use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SINK: &str = "openear.system-eq";
const FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Eq {
    pub enabled: bool,
    pub bands: [f64; 10],
}
impl Default for Eq {
    fn default() -> Self {
        Self {
            enabled: true,
            bands: [0.; 10],
        }
    }
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
        let boost = if self.enabled {
            self.bands.iter().map(|gain| gain.max(0.)).sum()
        } else {
            0.
        };
        10_f64.powf(-boost / 20.)
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
    pub fn graph(&self, target: &str) -> Value {
        let mut nodes = vec![
            json!({"type":"builtin","name":"preamp","label":"linear","control":{"Mult":self.headroom(),"Add":0}}),
        ];
        for (index, frequency) in FREQUENCIES.iter().enumerate() {
            let label = if index == 0 {
                "bq_lowshelf"
            } else if index == 9 {
                "bq_highshelf"
            } else {
                "bq_peaking"
            };
            nodes.push(json!({"type":"builtin","name":format!("eq{index}"),"label":label,"control":{"Freq":frequency,"Q":1.4,"Gain":if self.enabled {self.bands[index]} else {0.}}}));
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
                    "capture.props":{"node.name":SINK,"node.description":"Openear System EQ","media.class":"Audio/Sink"},
                    "playback.props":{"node.name":format!("{SINK}.output"),"node.passive":true,"target.object":target,"stream.dont-remix":true}
                }}
            ]
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_gain_and_stereo_graph_with_bypass() {
        let mut eq = Eq::default();
        eq.bands[0] = 6.;
        let graph = eq.graph("physical-output");
        let args = &graph["context.modules"][3]["args"];
        assert_eq!(args["filter.graph"]["nodes"].as_array().unwrap().len(), 11);
        assert_eq!(args["audio.channels"], 2);
        assert_eq!(args["playback.props"]["target.object"], "physical-output");
        assert!((eq.headroom() - 10_f64.powf(-6. / 20.)).abs() < 1e-8);
        eq.enabled = false;
        assert_eq!(eq.headroom(), 1.);
        assert_eq!(eq.controls()["params"][1], 0.);
        eq.bands[1] = f64::NAN;
        assert!(eq.validate().is_err());
        assert!(serde_json::from_str::<Eq>(r#"{"enabled":true,"bands":[1]}"#).is_err());
    }
}
