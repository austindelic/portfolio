//! Portfolio-owned camera presets interpreted by the external renderer.
pub use austindelic_blackhole::route::blend;
use austindelic_blackhole::{Camera, route::Routes};
use std::sync::LazyLock;

static ROUTES: LazyLock<Routes> = LazyLock::new(|| {
    Routes::from_json(include_str!(
        "../../../portfolio/src/config/black-hole-routes.json"
    ))
    .expect("valid portfolio camera routes")
});
pub fn camera(route: &str, seconds: f32, aspect: f32) -> Camera {
    ROUTES.camera(route, seconds, aspect)
}
pub fn intro_camera(route: &str, seconds: f32, aspect: f32) -> Camera {
    ROUTES.intro_camera(route, seconds, aspect)
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
