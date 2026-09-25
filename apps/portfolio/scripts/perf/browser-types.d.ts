/// <reference types="@webgpu/types" />
import type { BlackHoleStats } from "../../src/components/BlackHoleCore";
export interface PerfProbe {
  frames: { cpu: number; wall: number; draws: number }[];
  gpu: number[];
  calls: Record<string, number>;
  resources: Record<string, number>;
  firstFrame: number | null;
  gl: WebGL2RenderingContext | null;
  uniforms: Record<string, (number | number[])[]>;
  longTasks: number[];
  firstGpuCompletedFrame?: number | null;
  firstPresentationOpportunity?: number | null;
  compilationBlockingMs?: number;
  startupLongTasks?: number[];
}
declare global {
  interface Window {
    __perfProbe: PerfProbe;
    queued: () => number;
    step: (count?: number) => void;
    cameraUniforms: Record<string, number[]>;
    savedCanvas: Element | null;
    orbitTestCanvas: Element | null;
    __programsReady: number;
    __pipelinesReady: number;
    __draws: number;
    __shaderFrame: number;
    __shaderTime: number;
    __pageLoads: number;
    __gpuContexts: number;
    __ready: number;
    __injectBloomFailure: boolean;
    __stepFrames: (count: number) => void;
    __step: () => void;
    __realNow: () => number;
    __captureUniforms: Record<string, number | number[]>;
    __routeProbe: {
      programs: number;
      uniforms: Record<string, number | number[]>;
    };
    __compileProbe: {
      programs: Set<WebGLProgram>;
      shaders: Set<WebGLShader>;
      draws: number;
      hold: boolean;
    };
    __lifecycle: {
      programs: Set<WebGLProgram>;
      textures: Set<WebGLTexture>;
      contexts: number;
      draws: number;
      canvas: HTMLCanvasElement | null;
    };
    __failureProbe: {
      programs: Set<WebGLProgram>;
      shaders: Set<WebGLShader>;
      textures: Set<WebGLTexture>;
      framebuffers: Set<WebGLFramebuffer>;
      draws: number;
      failed: boolean;
    };
    __fontProbe: {
      contexts: number;
      draws: number;
      loads: (() => Promise<void>)[];
    };
    __passCompletion: { samples: number[][]; draws: number };
    __measure: {
      frames: { timestamp: number; cpu: number }[];
      version: number;
      firstDraw: number | null;
      resources: { textures: number; buffers: number };
      activeBackend?: string;
    };
    __gpuAudit: {
      devices: number;
      destroyed: number;
      textures: number;
      texturesDestroyed: number;
      errors: string[];
    };
    __gpuDevice: GPUDevice;
    __firstDevice: GPUDevice;
    __gl: WEBGL_lose_context;
    __lostContext: WEBGL_lose_context;
    __restoreExtension: WEBGL_lose_context;
    __exploreCanvas: Element | null;
    __firstCanvas: Element | null;
    __previousCanvas: Element | null;
    __restoreCanvas: Element | null;
    __originalBackground: Element | null;
    __previousStats: BlackHoleStats | undefined;
  }
}
