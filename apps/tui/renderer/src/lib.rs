//! Offscreen website shaders. Terminal output belongs exclusively to the CLI.
pub mod route;
use anyhow::{Context, Result};
use glam::Vec3;
use serde::Deserialize;
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tui_core::frame::{Cell, CellFrame};
use wgpu::util::DeviceExt;

#[derive(Clone, Debug)]
pub struct Camera {
    pub position: Vec3,
    pub forward: Vec3,
    pub up: Vec3,
}
impl Default for Camera {
    fn default() -> Self {
        Self {
            position: Vec3::new(11.256, 2.652, 18.44),
            forward: Vec3::new(-0.5655, -0.0771, -0.8211).normalize(),
            up: Vec3::Y,
        }
    }
}
impl Camera {
    pub fn translate(&mut self, forward: f32, right: f32, up: f32) {
        self.position += self.forward * forward + self.right() * right + self.up * up;
    }
    pub fn right(&self) -> Vec3 {
        self.forward.cross(self.up).normalize()
    }
    pub fn look(&mut self, yaw: f32, pitch: f32) {
        self.forward = (glam::Quat::from_axis_angle(self.up, yaw)
            * glam::Quat::from_axis_angle(self.right(), pitch)
            * self.forward)
            .normalize();
        self.up = self.right().cross(self.forward).normalize();
    }
    pub fn roll(&mut self, angle: f32) {
        self.up = glam::Quat::from_axis_angle(self.forward, angle) * self.up;
    }
}
#[derive(Clone, Debug)]
pub struct Request {
    pub width: u16,
    pub height: u16,
    pub generation: u64,
    pub history: u64,
    pub time: f32,
    pub aspect: f32,
    pub camera: Camera,
    pub exposure: f32,
    pub bloom: f32,
}
impl Default for Request {
    fn default() -> Self {
        Self {
            width: 120,
            height: 40,
            generation: 0,
            history: 0,
            time: 0.,
            aspect: 0.5,
            camera: Camera::default(),
            exposure: 2.,
            bloom: 0.65,
        }
    }
}
#[derive(Deserialize)]
struct Metrics {
    glyphs: String,
    metrics: Vec<u8>,
}
struct Texture {
    raw: wgpu::Texture,
    view: wgpu::TextureView,
    w: u32,
    h: u32,
}
struct Pass {
    pipeline: wgpu::RenderPipeline,
    uniform: wgpu::Buffer,
}
struct Slot {
    buffer: wgpu::Buffer,
    ready: Arc<Mutex<Option<std::result::Result<(), wgpu::BufferAsyncError>>>>,
    request: Option<Request>,
    serial: u64,
}
struct Targets {
    w: u32,
    h: u32,
    aspect: f32,
    textures: Vec<Texture>,
    slots: Vec<Slot>,
    stride: u32,
}
pub struct Renderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    passes: Vec<Pass>,
    empty: Texture,
    metrics: Texture,
    glyphs: Vec<char>,
    targets: Option<Targets>,
    frame: u64,
    history: u64,
    serial: u64,
    delivered: Option<u64>,
    errors: Arc<Mutex<Option<String>>>,
    pub adapter: String,
}
const VERTEX: &str = "@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));return vec4(p[i],0.,1.);}";
const SOURCES: [&str; 6] = [
    include_str!("../assets/buffer-a.wgsl"),
    include_str!("../assets/buffer-b.wgsl"),
    include_str!("../assets/buffer-c.wgsl"),
    include_str!("../assets/buffer-d.wgsl"),
    include_str!("../assets/image.wgsl"),
    include_str!("../assets/ascii-analysis.wgsl"),
];
fn texture(device: &wgpu::Device, w: u32, h: u32, format: wgpu::TextureFormat) -> Texture {
    let raw = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC
            | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let view = raw.create_view(&Default::default());
    Texture { raw, view, w, h }
}
impl Renderer {
    pub fn new() -> Result<Self> {
        pollster::block_on(Self::initialize())
    }
    async fn initialize() -> Result<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: if cfg!(target_os = "macos") {
                wgpu::Backends::METAL
            } else if cfg!(target_os = "windows") {
                wgpu::Backends::DX12
            } else {
                wgpu::Backends::VULKAN
            },
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: None,
                force_fallback_adapter: std::env::var_os("AUSTINDELIC_SOFTWARE_GPU").is_some(),
                ..Default::default()
            })
            .await
            .context("No compatible Metal/Vulkan/DirectX 12 adapter available")?;
        let adapter_name = adapter.get_info().name;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("terminal black hole"),
                ..Default::default()
            })
            .await?;
        let errors = Arc::new(Mutex::new(None));
        let e = errors.clone();
        device.on_uncaptured_error(Arc::new(move |err| {
            *e.lock().unwrap() = Some(err.to_string());
        }));
        let e = errors.clone();
        device.set_device_lost_callback(move |reason, message| {
            *e.lock().unwrap() = Some(format!("GPU lost: {reason:?}: {message}"));
        });
        let mut entries = vec![wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: wgpu::BufferSize::new(640),
            },
            count: None,
        }];
        for i in 0..6 {
            entries.push(wgpu::BindGroupLayoutEntry {
                binding: 1 + i * 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            });
            entries.push(wgpu::BindGroupLayoutEntry {
                binding: 2 + i * 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            });
        }
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &entries,
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let vertex = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(VERTEX.into()),
        });
        let mut passes = Vec::new();
        for (i, source) in SOURCES.iter().enumerate() {
            let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
            let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("website shader"),
                source: wgpu::ShaderSource::Wgsl((*source).into()),
            });
            let formats = if i == 5 {
                vec![wgpu::TextureFormat::Rgba8Unorm; 2]
            } else {
                vec![wgpu::TextureFormat::Rgba16Float]
            };
            let targets: Vec<_> = formats
                .into_iter()
                .map(|format| {
                    Some(wgpu::ColorTargetState {
                        format,
                        blend: None,
                        write_mask: wgpu::ColorWrites::ALL,
                    })
                })
                .collect();
            let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: None,
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &vertex,
                    entry_point: Some("main"),
                    compilation_options: Default::default(),
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("main"),
                    compilation_options: Default::default(),
                    targets: &targets,
                }),
                primitive: Default::default(),
                depth_stencil: None,
                multisample: Default::default(),
                multiview_mask: None,
                cache: None,
            });
            if let Some(error) = scope.pop().await {
                anyhow::bail!("Shader pass {i}: {error}");
            }
            let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: None,
                contents: &[0; 640],
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });
            passes.push(Pass { pipeline, uniform });
        }
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let data: Metrics = serde_json::from_str(include_str!("../assets/glyph-metrics.json"))?;
        let glyphs: Vec<_> = data.glyphs.chars().collect();
        let metrics = texture(
            &device,
            glyphs.len() as u32,
            1,
            wgpu::TextureFormat::Rgba8Unorm,
        );
        queue.write_texture(
            metrics.raw.as_image_copy(),
            &data.metrics,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(metrics.w * 4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: metrics.w,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let empty = texture(&device, 1, 1, wgpu::TextureFormat::Rgba16Float);
        Ok(Self {
            device,
            queue,
            layout,
            sampler,
            passes,
            empty,
            metrics,
            glyphs,
            targets: None,
            frame: 0,
            history: 0,
            serial: 0,
            delivered: None,
            errors,
            adapter: adapter_name,
        })
    }
    fn resize(&mut self, r: &Request) {
        let w = u32::from(r.width.clamp(1, 240));
        let h = u32::from(r.height.clamp(1, 80));
        let sw = w * 2;
        let sh = (h as f32 * 2. / r.aspect).round() as u32;
        let mut textures = Vec::new(); // history 0/1, bloom 2/3/4, scene 5, colors 6/7, states 8/9
        for i in 0..10 {
            let (tw, th, format) = if i >= 6 {
                (w, h, wgpu::TextureFormat::Rgba8Unorm)
            } else {
                (sw, sh, wgpu::TextureFormat::Rgba16Float)
            };
            textures.push(texture(&self.device, tw, th, format));
        }
        let stride = (w * 4).div_ceil(256) * 256;
        let slots = (0..3)
            .map(|_| Slot {
                buffer: self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("cell readback"),
                    size: u64::from(stride * h * 2),
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                }),
                ready: Arc::new(Mutex::new(None)),
                request: None,
                serial: 0,
            })
            .collect();
        self.targets = Some(Targets {
            w,
            h,
            aspect: r.aspect,
            textures,
            slots,
            stride,
        });
        self.frame = 0;
        self.history = r.history;
    }
    fn draw(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        index: usize,
        outputs: &[&Texture],
        channels: &[&Texture],
        r: &Request,
    ) {
        let t = self.targets.as_ref().unwrap();
        let p = &self.passes[index];
        let mut u = [[0f32; 4]; 40];
        u[0] = [outputs[0].w as f32, outputs[0].h as f32, 1., 0.];
        u[1][0] = r.time;
        u[2][0] = 1. / 30.;
        u[3][0] = if index == 5 {
            f32::from(self.frame > 0)
        } else {
            self.frame as f32
        };
        for (i, c) in channels.iter().take(4).enumerate() {
            u[5 + i] = [c.w as f32, c.h as f32, 1., 0.];
        }
        u[9][..3].copy_from_slice(&r.camera.position.to_array());
        u[10][..3].copy_from_slice(&r.camera.right().to_array());
        u[11][..3].copy_from_slice(&r.camera.right().cross(r.camera.forward).to_array());
        u[12][0] = 1.;
        u[13][0] = 0.72;
        u[15][0] = 0.5;
        // Logical canvas pixels preserve the terminal's physical character aspect.
        u[17] = [t.w as f32 * 4., t.h as f32 * 4. / r.aspect, 0., 0.];
        u[18] = [4., 4. / r.aspect, 0., 0.];
        u[19][0] = 1.;
        u[20][0] = self.glyphs.len() as f32;
        u[22][0] = 1.;
        u[27][0] = r.exposure;
        u[28][0] = r.bloom;
        self.queue
            .write_buffer(&p.uniform, 0, bytemuck::cast_slice(&u));
        let mut entries = vec![wgpu::BindGroupEntry {
            binding: 0,
            resource: p.uniform.as_entire_binding(),
        }];
        for i in 0..6 {
            let c = channels.get(i).copied().unwrap_or(&self.empty);
            entries.push(wgpu::BindGroupEntry {
                binding: 1 + i as u32 * 2,
                resource: wgpu::BindingResource::TextureView(&c.view),
            });
            entries.push(wgpu::BindGroupEntry {
                binding: 2 + i as u32 * 2,
                resource: wgpu::BindingResource::Sampler(&self.sampler),
            });
        }
        let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.layout,
            entries: &entries,
        });
        let attachments: Vec<_> = outputs
            .iter()
            .map(|t| {
                Some(wgpu::RenderPassColorAttachment {
                    view: &t.view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })
            })
            .collect();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &attachments,
            ..Default::default()
        });
        pass.set_pipeline(&p.pipeline);
        pass.set_bind_group(0, &group, &[]);
        pass.draw(0..3, 0..1);
    }
    pub fn submit(&mut self, r: Request) -> Result<bool> {
        if let Some(err) = self.errors.lock().unwrap().take() {
            anyhow::bail!(err);
        }
        if self.targets.as_ref().is_none_or(|t| {
            t.w != u32::from(r.width.clamp(1, 240))
                || t.h != u32::from(r.height.clamp(1, 80))
                || t.aspect != r.aspect
        }) {
            self.resize(&r);
        }
        if r.history != self.history {
            self.frame = 0;
            self.history = r.history;
        }
        let t = self.targets.as_ref().unwrap();
        let Some(slot_index) = t.slots.iter().position(|s| s.request.is_none()) else {
            return Ok(false);
        };
        let tx = &t.textures;
        let n = (self.frame % 2) as usize;
        let next = 1 - n;
        let mut encoder = self.device.create_command_encoder(&Default::default());
        self.draw(
            &mut encoder,
            0,
            &[&tx[next]],
            &[&self.empty, &self.empty, &self.empty, &tx[n]],
            &r,
        );
        self.draw(&mut encoder, 1, &[&tx[2]], &[&tx[next]], &r);
        self.draw(&mut encoder, 2, &[&tx[3]], &[&tx[2]], &r);
        self.draw(&mut encoder, 3, &[&tx[4]], &[&tx[3]], &r);
        self.draw(
            &mut encoder,
            4,
            &[&tx[5]],
            &[&tx[next], &tx[2], &tx[3], &tx[4]],
            &r,
        );
        self.draw(
            &mut encoder,
            5,
            &[&tx[6 + next], &tx[8 + next]],
            &[&tx[5], &tx[8 + n], &self.metrics, &tx[6 + n]],
            &r,
        );
        for (i, tex) in [&tx[6 + next], &tx[8 + next]].iter().enumerate() {
            encoder.copy_texture_to_buffer(
                tex.raw.as_image_copy(),
                wgpu::TexelCopyBufferInfo {
                    buffer: &t.slots[slot_index].buffer,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: u64::from(t.stride * t.h) * i as u64,
                        bytes_per_row: Some(t.stride),
                        rows_per_image: Some(t.h),
                    },
                },
                wgpu::Extent3d {
                    width: t.w,
                    height: t.h,
                    depth_or_array_layers: 1,
                },
            );
        }
        self.queue.submit([encoder.finish()]);
        let slot = &mut self.targets.as_mut().unwrap().slots[slot_index];
        slot.request = Some(r);
        slot.serial = self.serial;
        self.serial += 1;
        let ready = slot.ready.clone();
        slot.buffer
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |result| {
                *ready.lock().unwrap() = Some(result);
            });
        self.frame += 1;
        Ok(true)
    }
    pub fn poll(&mut self) -> Result<Option<CellFrame>> {
        if let Some(err) = self.errors.lock().unwrap().take() {
            anyhow::bail!(err);
        }
        self.device.poll(wgpu::PollType::Poll)?;
        let Some(t) = self.targets.as_mut() else {
            return Ok(None);
        };
        let mut latest = None;
        let mut serial = 0;
        for slot in &mut t.slots {
            let ready = slot.ready.lock().unwrap().take();
            if let Some(result) = ready {
                result?;
                let r = slot.request.take().unwrap();
                let view = slot.buffer.slice(..).get_mapped_range();
                let mut cells = Vec::with_capacity((t.w * t.h) as usize);
                for y in (0..t.h).rev() {
                    for x in 0..t.w {
                        let offset = (y * t.stride + x * 4) as usize;
                        let state = offset + (t.stride * t.h) as usize;
                        let glyph = self
                            .glyphs
                            .get(view[state] as usize)
                            .copied()
                            .unwrap_or(' ');
                        cells.push(Cell {
                            glyph,
                            rgb: [view[offset], view[offset + 1], view[offset + 2]],
                        });
                    }
                }
                drop(view);
                slot.buffer.unmap();
                if self.delivered.is_none_or(|previous| slot.serial > previous)
                    && (latest.is_none() || slot.serial >= serial)
                {
                    serial = slot.serial;
                    latest = Some(CellFrame {
                        width: t.w as u16,
                        height: t.h as u16,
                        generation: r.generation,
                        cells,
                    });
                }
            }
        }
        if latest.is_some() {
            self.delivered = Some(serial);
        }
        Ok(latest)
    }
}
/// A bounded latest-value mailbox; stale requests/frames never form a queue.
pub struct Worker {
    request: Arc<Mutex<Option<Request>>>,
    pub frame: Arc<Mutex<Option<CellFrame>>>,
    pub status: Arc<Mutex<String>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Worker {
    pub fn start(fps: u32) -> Self {
        let request = Arc::new(Mutex::new(None::<Request>));
        let frame = Arc::new(Mutex::new(None));
        let status = Arc::new(Mutex::new("Starting live renderer".into()));
        let stop = Arc::new(AtomicBool::new(false));
        let (req, out, msg, quit) = (request.clone(), frame.clone(), status.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<()> {
                    let mut renderer = Renderer::new()?;
                    *msg.lock().unwrap() = format!("GPU · {}", renderer.adapter);
                    let mut last = Instant::now() - Duration::from_secs(1);
                    let interval = Duration::from_secs_f64(1. / f64::from(fps));
                    while !quit.load(Ordering::Relaxed) {
                        if let Some(f) = renderer.poll()? {
                            *out.lock().unwrap() = Some(f);
                        }
                        if last.elapsed() >= interval {
                            let pending = req.lock().unwrap().take();
                            if let Some(r) = pending {
                                if renderer.submit(r.clone())? {
                                    last += interval;
                                    if last.elapsed() > interval {
                                        last = Instant::now();
                                    }
                                } else {
                                    let mut slot = req.lock().unwrap();
                                    if slot.is_none() {
                                        *slot = Some(r);
                                    }
                                }
                            }
                        }
                        std::thread::sleep(Duration::from_millis(2));
                    }
                    Ok(())
                }));
            match result {
                Ok(Ok(())) => {}
                Ok(Err(e)) => *msg.lock().unwrap() = format!("Static fallback: {e}"),
                Err(_) => *msg.lock().unwrap() = "Static fallback: GPU worker failed".into(),
            }
        });
        Self {
            request,
            frame,
            status,
            stop,
            thread: Some(thread),
        }
    }
    pub fn request(&self, r: Request) {
        *self.request.lock().unwrap() = Some(r);
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if self.thread.as_ref().is_some_and(|t| t.is_finished()) {
            let _ = self.thread.take().unwrap().join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_glyph_state_indices_are_valid() {
        let m: Metrics =
            serde_json::from_str(include_str!("../assets/glyph-metrics.json")).unwrap();
        assert_eq!(m.metrics.len(), m.glyphs.chars().count() * 4);
        assert_eq!(m.glyphs.chars().next(), Some(' '));
        assert!(m.metrics.chunks(4).all(|m| m[3] == 255));
    }
    #[test]
    fn uniform_layout_matches_website() {
        let slots: serde_json::Value =
            serde_json::from_str(include_str!("../assets/uniform-layout.json")).unwrap();
        for (name, index) in [
            ("iResolution", 0),
            ("iTime", 1),
            ("iFrame", 3),
            ("uCameraPosition", 9),
            ("uCameraRight", 10),
            ("uCameraUp", 11),
            ("uCanvasResolution", 17),
            ("uAsciiCellSize", 18),
            ("uGlyphCount", 20),
            ("uExposure", 27),
            ("uBloomStrength", 28),
        ] {
            assert_eq!(slots[name], index);
        }
        assert_eq!(std::mem::size_of::<[[f32; 4]; 40]>(), 640);
    }
    #[test]
    fn readback_padding() {
        for width in [1u32, 60, 80, 120, 160, 240] {
            let stride = (width * 4).div_ceil(256) * 256;
            assert!(stride >= width * 4);
            assert_eq!(stride % 256, 0);
        }
    }
}
