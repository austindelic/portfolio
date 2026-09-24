//! Authored website orbit, evaluated in terminal viewport proportions.
use crate::Camera;
use glam::Vec3;
use serde::Deserialize;
use std::{collections::HashMap, sync::LazyLock};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Orbit {
    anchor: [f32; 3],
    look_target: [f32; 3],
    drift_radius: f32,
    period: f32,
    framing_target: [f32; 2],
    #[serde(default)]
    yaw_amplitude: f32,
    #[serde(default)]
    pitch_amplitude: f32,
}
#[derive(Deserialize)]
struct Keyframe {
    position: [f32; 3],
    forward: [f32; 3],
    duration: f32,
}
#[derive(Deserialize)]
struct Route {
    orbit: Orbit,
    intro: Vec<Keyframe>,
}
static ROUTES: LazyLock<HashMap<String, Route>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../assets/routes.json")).expect("valid website routes")
});
pub fn camera(route: &str, seconds: f32, aspect: f32) -> Camera {
    let r = ROUTES.get(route).unwrap_or(&ROUTES["fallback"]);
    let o = &r.orbit;
    let phase = seconds * std::f32::consts::TAU / o.period;
    let a = Vec3::from_array(o.anchor);
    let horizontal = a.x.hypot(a.z).max(0.0001);
    let drift = o.drift_radius * phase.cos();
    let position = (a + Vec3::new(drift * a.z / horizontal, 0., -drift * a.x / horizontal))
        * (1. + o.drift_radius * phase.sin() / a.length());
    let d = Vec3::from_array(o.look_target) - position;
    let fov = (std::f32::consts::PI / 6.).tan();
    let yaw = d.x.atan2(d.z)
        + (o.framing_target[0] * (aspect / 1.5).clamp(0.35, 1.) * fov).atan()
        + o.yaw_amplitude.to_radians() * phase.sin();
    let pitch = d.y.atan2(d.x.hypot(d.z)) - (o.framing_target[1] * fov / aspect).atan()
        + o.pitch_amplitude.to_radians() * phase.cos();
    Camera {
        position,
        forward: Vec3::new(
            yaw.sin() * pitch.cos(),
            pitch.sin(),
            yaw.cos() * pitch.cos(),
        ),
        up: Vec3::Y,
    }
}
pub fn intro_camera(route: &str, seconds: f32, aspect: f32) -> Camera {
    let r = ROUTES.get(route).unwrap_or(&ROUTES["fallback"]);
    let duration = r.intro.iter().map(|f| f.duration).sum::<f32>();
    let settled = camera(route, seconds, aspect);
    if seconds >= duration || r.intro.is_empty() {
        return settled;
    }
    let first = &r.intro[0];
    let start = Camera {
        position: Vec3::from_array(first.position),
        forward: Vec3::from_array(first.forward).normalize(),
        up: Vec3::Y,
    };
    blend(&start, &settled, (seconds / duration).clamp(0., 1.))
}
/// Spherical interpolation stays outside the singularity during route changes.
pub fn blend(a: &Camera, b: &Camera, t: f32) -> Camera {
    let t = t * t * t * (t * (t * 6. - 15.) + 10.);
    let ar = a.position.length().max(0.001);
    let br = b.position.length().max(0.001);
    let rotation = glam::Quat::from_rotation_arc(a.position / ar, b.position / br);
    let position = (glam::Quat::IDENTITY.slerp(rotation, t) * (a.position / ar))
        * (ar.ln() * (1. - t) + br.ln() * t).exp();
    let aim = glam::Quat::from_rotation_arc(a.forward, b.forward);
    Camera {
        position,
        forward: (glam::Quat::IDENTITY.slerp(aim, t) * a.forward).normalize(),
        up: Vec3::Y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authored_orbits_are_finite() {
        for route in ["/", "/blog", "/blog/*", "/socials"] {
            for aspect in [0.5, 1., 2., 4.] {
                let a = camera(route, 0., aspect);
                let b = camera(route, 30., aspect);
                assert!(a.position.is_finite() && a.forward.is_finite());
                assert!((a.forward.length() - 1.).abs() < 0.0001);
                assert!(a.position.distance(b.position) > 0.);
                for i in 0..11 {
                    let c = blend(&a, &b, i as f32 / 10.);
                    assert!(c.position.length() > 0.1);
                }
            }
        }
    }
}
