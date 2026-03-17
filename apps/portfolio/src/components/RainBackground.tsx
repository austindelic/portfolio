import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Texture, Triangle, Vec2 } from "ogl";

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `
#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUv;

uniform float iTime;
uniform vec3 iResolution;
uniform sampler2D uTexture;
uniform vec2 uTextureResolution;
uniform float uHasTexture;
uniform float uRainAmount;
uniform float uTimeScale;
uniform float uMinBlur;
uniform float uMaxBlurMin;
uniform float uMaxBlurMax;
uniform float uSceneZoomBase;
uniform float uSceneZoomAmplitude;
uniform float uUvZoomBase;
uniform float uUvZoomAmplitude;
uniform float uZoomFrequency;
uniform float uColorShiftStrength;
uniform float uLightningStrength;
uniform float uVignetteStrength;
uniform float uEnablePost;

#define S(a, b, t) smoothstep(a, b, t)
#define USE_POST_PROCESSING

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(.1031, .11369, .13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

vec4 N14(float t) {
  return fract(sin(t * vec4(123., 1024., 1456., 264.)) * vec4(6547., 345., 8799., 1564.));
}

float N(float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw(float b, float t) {
  return S(0., b, t) * S(1., b, t);
}

vec2 DropLayer2(vec2 uv, float t) {
  vec2 UV = uv;

  uv.y += t * 0.75;
  vec2 a = vec2(6., 1.);
  vec2 grid = a * 2.;
  vec2 id = floor(uv * grid);

  float colShift = N(id.x);
  uv.y += colShift;

  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(.5, 0.);

  float x = n.x - .5;

  float y = UV.y * 20.;
  float wiggle = sin(y + sin(y));
  x += wiggle * (.5 - abs(x)) * (n.z - .5);
  x *= .7;
  float ti = fract(t + n.z);
  y = (Saw(.85, ti) - .5) * .9 + .5;
  vec2 p = vec2(x, y);

  float d = length((st - p) * a.yx);
  float mainDrop = S(.4, .0, d);

  float r = sqrt(S(1., y, st.y));
  float cd = abs(st.x - x);
  float trail = S(.23 * r, .15 * r * r, cd);
  float trailFront = S(-.02, .02, st.y - y);
  trail *= trailFront * r * r;

  y = UV.y;
  float trail2 = S(.2 * r, .0, cd);
  float droplets = max(0., (sin(y * (1. - y) * 120.) - st.y)) * trail2 * trailFront * n.z;
  y = fract(y * 10.) + (st.y - .5);
  float dd = length(st - vec2(x, y));
  droplets = S(.3, 0., dd);

  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops(vec2 uv, float t) {
  uv *= 40.;

  vec2 id = floor(uv);
  uv = fract(uv) - .5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - .5) * .7;
  float d = length(uv - p);

  float fade = Saw(.025, fract(t + n.z));
  return S(.3, 0., d) * fract(n.z * 10.) * fade;
}

vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = StaticDrops(uv, t) * l0;
  vec2 m1 = DropLayer2(uv, t) * l1;
  vec2 m2 = DropLayer2(uv * 1.85, t) * l2;

  float c = s + m1.x + m2.x;
  c = S(.3, 1., c);

  return vec2(c, max(m1.y * l0, m2.y * l1));
}

vec2 coverUv(vec2 uv) {
  float viewportAspect = iResolution.x / iResolution.y;
  float imageAspect = uTextureResolution.x / max(uTextureResolution.y, 1.0);

  if (viewportAspect > imageAspect) {
    float scale = imageAspect / viewportAspect;
    uv.y = uv.y * scale + (1.0 - scale) * 0.5;
  } else {
    float scale = viewportAspect / imageAspect;
    uv.x = uv.x * scale + (1.0 - scale) * 0.5;
  }

  return clamp(uv, 0.0, 1.0);
}

vec3 sampleBackground(vec2 uv, float blur) {
  if (uHasTexture < 0.5) {
    return vec3(0.0);
  }

  float radius = blur / iResolution.y;
  vec2 r = vec2(radius, radius);
  vec2 sampleUv = coverUv(uv);

  vec3 col = texture2D(uTexture, sampleUv).rgb * 0.227027;
  col += texture2D(uTexture, coverUv(uv + vec2(r.x * 1.384615, 0.0))).rgb * 0.316216;
  col += texture2D(uTexture, coverUv(uv - vec2(r.x * 1.384615, 0.0))).rgb * 0.316216;
  col += texture2D(uTexture, coverUv(uv + vec2(0.0, r.y * 1.384615))).rgb * 0.070270;
  col += texture2D(uTexture, coverUv(uv - vec2(0.0, r.y * 1.384615))).rgb * 0.070270;

  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord.xy - .5 * iResolution.xy) / iResolution.y;
  vec2 UV = fragCoord.xy / iResolution.xy;
  float T = iTime;

  float t = T * uTimeScale;
  float rainAmount = clamp(uRainAmount, 0.0, 1.0);

  float maxBlur = mix(uMaxBlurMin, uMaxBlurMax, rainAmount);
  float minBlur = uMinBlur;

  float zoom = -cos(T * uZoomFrequency);
  uv *= uSceneZoomBase + zoom * uSceneZoomAmplitude;
  UV = (UV - .5) * (uUvZoomBase + zoom * uUvZoomAmplitude) + .5;

  float staticDrops = S(-.5, 1., rainAmount) * 2.;
  float layer1 = S(.25, .75, rainAmount);
  float layer2 = S(.0, .5, rainAmount);

  vec2 c = Drops(uv, t, staticDrops, layer1, layer2);
  vec2 e = vec2(.001, 0.);
  float cx = Drops(uv + e, t, staticDrops, layer1, layer2).x;
  float cy = Drops(uv + e.yx, t, staticDrops, layer1, layer2).x;
  vec2 n = vec2(cx - c.x, cy - c.x);

  float focus = mix(maxBlur - c.y, minBlur, S(.1, .2, c.x));
  vec3 col = sampleBackground(UV + n, focus);

  #ifdef USE_POST_PROCESSING
  if (uEnablePost > 0.5) {
    t = (T + 3.) * .5;
    float colFade = sin(t * .2) * .5 + .5;
    vec3 shifted = col * mix(vec3(1.), vec3(.8, .9, 1.3), colFade);
    col = mix(col, shifted, uColorShiftStrength);

    float lightning = sin(t * sin(t * 10.));
    lightning *= pow(max(0., sin(t + sin(t))), 10.);
    col *= 1. + lightning * uLightningStrength;

    vec2 vignetteUv = UV - .5;
    col *= 1. - dot(vignetteUv, vignetteUv) * uVignetteStrength;
  }
  #endif

  fragColor = vec4(col, uHasTexture);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

type Props = {
  imageSrc?: string;
  rainAmount?: number;
  timeScale?: number;
  minBlur?: number;
  maxBlurMin?: number;
  maxBlurMax?: number;
  sceneZoomBase?: number;
  sceneZoomAmplitude?: number;
  uvZoomBase?: number;
  uvZoomAmplitude?: number;
  zoomFrequency?: number;
  colorShiftStrength?: number;
  lightningStrength?: number;
  vignetteStrength?: number;
  enablePost?: boolean;
};

export default function RainBackground({
  imageSrc = "/ferns.png",
  rainAmount = 0.8,
  timeScale = 0.2,
  minBlur = 2,
  maxBlurMin = 3,
  maxBlurMax = 6,
  sceneZoomBase = 0.7,
  sceneZoomAmplitude = 0.3,
  uvZoomBase = 0.9,
  uvZoomAmplitude = 0.1,
  zoomFrequency = 0.2,
  colorShiftStrength = 1,
  lightningStrength = 1,
  vignetteStrength = 1,
  enablePost = true,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const renderer = new Renderer({
      canvas,
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });

    const gl = renderer.gl;
    const geometry = new Triangle(gl);
    const texture = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    const textureResolution = new Vec2(1, 1);

    gl.clearColor(0, 0, 0, 0);

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1],
        },
        uTexture: { value: texture },
        uTextureResolution: { value: textureResolution },
        uHasTexture: { value: 0 },
        uRainAmount: { value: rainAmount },
        uTimeScale: { value: timeScale },
        uMinBlur: { value: minBlur },
        uMaxBlurMin: { value: maxBlurMin },
        uMaxBlurMax: { value: maxBlurMax },
        uSceneZoomBase: { value: sceneZoomBase },
        uSceneZoomAmplitude: { value: sceneZoomAmplitude },
        uUvZoomBase: { value: uvZoomBase },
        uUvZoomAmplitude: { value: uvZoomAmplitude },
        uZoomFrequency: { value: zoomFrequency },
        uColorShiftStrength: { value: colorShiftStrength },
        uLightningStrength: { value: lightningStrength },
        uVignetteStrength: { value: vignetteStrength },
        uEnablePost: { value: enablePost ? 1 : 0 },
      },
      transparent: true,
    });

    const mesh = new Mesh(gl, { geometry, program });

    const applyImage = () => {
      texture.image = image;
      texture.needsUpdate = true;
      textureResolution.set(
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
      );
      program.uniforms.uHasTexture.value = 1;
    };

    if (image.complete && image.naturalWidth > 0) {
      applyImage();
    } else {
      image.addEventListener("load", applyImage);
    }

    const resize = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      renderer.setSize(width, height);
      program.uniforms.iResolution.value = [
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        1,
      ];
    };

    window.addEventListener("resize", resize);
    resize();

    const start = performance.now();
    let frame = 0;

    const loop = () => {
      program.uniforms.iTime.value = (performance.now() - start) / 1000;
      program.uniforms.uRainAmount.value = rainAmount;
      program.uniforms.uTimeScale.value = timeScale;
      program.uniforms.uMinBlur.value = minBlur;
      program.uniforms.uMaxBlurMin.value = maxBlurMin;
      program.uniforms.uMaxBlurMax.value = maxBlurMax;
      program.uniforms.uSceneZoomBase.value = sceneZoomBase;
      program.uniforms.uSceneZoomAmplitude.value = sceneZoomAmplitude;
      program.uniforms.uUvZoomBase.value = uvZoomBase;
      program.uniforms.uUvZoomAmplitude.value = uvZoomAmplitude;
      program.uniforms.uZoomFrequency.value = zoomFrequency;
      program.uniforms.uColorShiftStrength.value = colorShiftStrength;
      program.uniforms.uLightningStrength.value = lightningStrength;
      program.uniforms.uVignetteStrength.value = vignetteStrength;
      program.uniforms.uEnablePost.value = enablePost ? 1 : 0;
      renderer.render({ scene: mesh });
      frame = window.requestAnimationFrame(loop);
    };

    loop();

    return () => {
      image.removeEventListener("load", applyImage);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [
    colorShiftStrength,
    enablePost,
    imageSrc,
    lightningStrength,
    maxBlurMax,
    maxBlurMin,
    minBlur,
    rainAmount,
    sceneZoomAmplitude,
    sceneZoomBase,
    timeScale,
    uvZoomAmplitude,
    uvZoomBase,
    vignetteStrength,
    zoomFrequency,
  ]);

  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <img
        ref={imageRef}
        src={imageSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <canvas ref={ref} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
