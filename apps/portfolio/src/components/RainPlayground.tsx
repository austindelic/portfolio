import { useState } from "react";
import RainBackground from "./RainBackground";

const defaults = {
  rainAmount: 0.8,
  timeScale: 0.2,
  minBlur: 2,
  maxBlurMin: 3,
  maxBlurMax: 6,
  sceneZoomBase: 0.7,
  sceneZoomAmplitude: 0.3,
  uvZoomBase: 0.9,
  uvZoomAmplitude: 0.1,
  zoomFrequency: 0.2,
  colorShiftStrength: 1,
  lightningStrength: 1,
  vignetteStrength: 1,
  enablePost: true,
};

type Params = typeof defaults;

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <label className="grid gap-1">
      <div className="flex items-center justify-between gap-4 text-[11px] text-gray-300">
        <span>{label}</span>
        <span className="text-gray-500">{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function RainPlayground() {
  const [params, setParams] = useState<Params>(defaults);

  const setParam = <K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  const json = JSON.stringify(params, null, 2);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="fixed inset-0">
        <RainBackground imageSrc="/ferns.png" {...params} />
      </div>

      <div className="relative z-10 flex min-h-screen items-start justify-end p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/70 p-4 font-mono text-xs backdrop-blur-xl">
          <div className="mb-4">
            <h1 className="text-sm text-white">Rain Test</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
              Tune this page, then send me the JSON block.
            </p>
          </div>

          <div className="grid gap-3">
            <Slider label="rainAmount" min={0} max={1} step={0.01} value={params.rainAmount} onChange={(value) => setParam("rainAmount", value)} />
            <Slider label="timeScale" min={0} max={1} step={0.01} value={params.timeScale} onChange={(value) => setParam("timeScale", value)} />
            <Slider label="minBlur" min={0} max={8} step={0.1} value={params.minBlur} onChange={(value) => setParam("minBlur", value)} />
            <Slider label="maxBlurMin" min={0} max={12} step={0.1} value={params.maxBlurMin} onChange={(value) => setParam("maxBlurMin", value)} />
            <Slider label="maxBlurMax" min={0} max={12} step={0.1} value={params.maxBlurMax} onChange={(value) => setParam("maxBlurMax", value)} />
            <Slider label="sceneZoomBase" min={0.1} max={2} step={0.01} value={params.sceneZoomBase} onChange={(value) => setParam("sceneZoomBase", value)} />
            <Slider label="sceneZoomAmplitude" min={0} max={1} step={0.01} value={params.sceneZoomAmplitude} onChange={(value) => setParam("sceneZoomAmplitude", value)} />
            <Slider label="uvZoomBase" min={0.1} max={2} step={0.01} value={params.uvZoomBase} onChange={(value) => setParam("uvZoomBase", value)} />
            <Slider label="uvZoomAmplitude" min={0} max={0.5} step={0.01} value={params.uvZoomAmplitude} onChange={(value) => setParam("uvZoomAmplitude", value)} />
            <Slider label="zoomFrequency" min={0} max={1} step={0.01} value={params.zoomFrequency} onChange={(value) => setParam("zoomFrequency", value)} />
            <Slider label="colorShiftStrength" min={0} max={1} step={0.01} value={params.colorShiftStrength} onChange={(value) => setParam("colorShiftStrength", value)} />
            <Slider label="lightningStrength" min={0} max={2} step={0.01} value={params.lightningStrength} onChange={(value) => setParam("lightningStrength", value)} />
            <Slider label="vignetteStrength" min={0} max={2} step={0.01} value={params.vignetteStrength} onChange={(value) => setParam("vignetteStrength", value)} />
          </div>

          <label className="mt-4 flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={params.enablePost}
              onChange={(event) => setParam("enablePost", event.target.checked)}
            />
            enablePost
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded border border-white/15 px-3 py-1 text-[11px] text-white"
              onClick={() => setParams(defaults)}
            >
              Reset
            </button>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black/70 p-3 text-[10px] leading-relaxed text-cyan-300">
            {json}
          </pre>
        </div>
      </div>
    </div>
  );
}
