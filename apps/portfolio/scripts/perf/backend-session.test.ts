interface Canvas {
  cloneNode(): Canvas;
  replaceWith(next: Canvas): void;
}
interface Backend {
  disposals: number;
  dispose(): void;
}
interface BackendOptions {
  canvas: Canvas;
  onFailure(error: Error): void;
  signal: AbortSignal;
}
interface State {
  atlasConfig: object;
  controls: { bloomStrength: number };
  runtimeSnapshot: { shaderTime?: number };
}
interface Options {
  backendState: string;
}
interface Session {
  canvas: Canvas;
  state: State;
  options: Options;
  backend: Backend;
  cleaned: number;
}
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const runtime = await readFile(
  new URL("../../src/components/BlackHoleRuntime.ts", import.meta.url),
  "utf8",
);
const session = ts.transpile(
  runtime
    .slice(
      runtime.indexOf("function startBlackHoleSession("),
      runtime.indexOf("function startRendererSession("),
    )
    .replaceAll('import("./BlackHoleWebGpuBackend")', 'load("gpu")')
    .replaceAll('import("./BlackHoleWebGlBackend")', 'load("gl")'),
  { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(
  factory: (kind: string, options: BackendOptions) => Promise<Backend>,
) {
  const calls: { kind: string; options: BackendOptions }[] = [],
    errors: (string | null)[] = [],
    replacements: Canvas[] = [],
    sessions: Session[] = [];
  const canvas = (): Canvas => ({
    cloneNode: canvas,
    replaceWith(next: Canvas) {
      replacements.push(next);
    },
  });
  const start = new Function(
    "resolveShaderBackend",
    "resolveRendererMode",
    "resolveRenderSettings",
    "formatError",
    "startRendererSession",
    "load",
    session + ";return startBlackHoleSession;",
  )(
    (b: string) => (b === "webgl2" ? "webgl2" : "webgpu"),
    (m: unknown) => m,
    (s: unknown) => s,
    String,
    (canvas: Canvas, state: State, options: Options, backend: Backend) => {
      const s = { canvas, state, options, backend, cleaned: 0 };
      sessions.push(s);
      return () => {
        s.cleaned++;
        state.runtimeSnapshot.shaderTime = 42;
      };
    },
    async (kind: string) => ({
      [kind === "gpu" ? "createWebGpuBackend" : "createWebGlBackend"]: async (
        options: BackendOptions,
      ) => {
        calls.push({ kind, options });
        return factory(kind, options);
      },
    }),
  );
  const state: State = {
    atlasConfig: {},
    controls: { bloomStrength: 0.4 },
    runtimeSnapshot: {},
  };
  const stop = start(canvas(), state, {
    backendState: "webgpu",
    rendererModeState: "full",
    renderSettings: {},
    onError: (e: string | null) => errors.push(e),
    onCanvasReplaced: (c: Canvas) => replacements.push(c),
    showControls: false,
    debugStats: false,
  });
  return { calls, errors, replacements, sessions, stop, state };
}
const backend = () => ({
  disposals: 0,
  dispose() {
    this.disposals++;
  },
});
test("initial WebGPU failure starts WebGL on a fresh canvas without changing requested preference", async () => {
  const gl = backend(),
    f = fixture(async (kind: string) => {
      if (kind === "gpu") throw Error("no adapter");
      return gl;
    });
  await flush();
  await flush();
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ["gpu", "gl"],
  );
  assert.equal(f.sessions.length, 1);
  assert.notEqual(f.calls[0].options.canvas, f.calls[1].options.canvas);
  assert.equal(f.sessions[0].options.backendState, "webgpu");
  assert.equal(f.errors.at(-1), null);
  f.stop();
});
test("late loss snapshots state and falls back once; stale GPU errors cannot kill WebGL", async () => {
  const f = fixture(async () => backend());
  await flush();
  f.calls[0].options.onFailure(Error("lost"));
  await flush();
  await flush();
  assert.equal(f.sessions[0].cleaned, 1);
  assert.equal(f.state.runtimeSnapshot.shaderTime, 42);
  assert.equal(f.sessions.length, 2);
  f.calls[0].options.onFailure(Error("stale error"));
  await flush();
  assert.equal(f.sessions[1].cleaned, 0);
  f.calls[1].options.onFailure(Error("GL failed"));
  await flush();
  assert.equal(f.calls.length, 2);
  assert.match(f.errors.at(-1)!, /GL failed/);
  f.stop();
});
test("disposal while initializing prevents a late backend from starting a session", async () => {
  let finish!: (value: Backend) => void;
  const b = backend(),
    f = fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  await flush();
  f.stop();
  finish(b);
  await flush();
  assert.equal(f.sessions.length, 0);
  assert.equal(b.disposals, 1);
  assert.equal(f.calls[0].options.signal.aborted, true);
  assert.deepEqual(f.errors, []);
});
test("failure after a cancelled initialization cannot start a fallback", async () => {
  let reject!: (error: Error) => void;
  const f = fixture(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  await flush();
  f.stop();
  reject(Error("late failure"));
  await flush();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.errors, []);
});

test("Auto prefers WebGPU for full and cell modes, while explicit WebGL2 remains an override", async () => {
  const core = await readFile(
    new URL("../../src/components/BlackHoleCore.ts", import.meta.url),
    "utf8",
  );
  const source = ts
    .transpile(
      core.slice(
        core.indexOf("export function isWebGpuAvailable"),
        core.indexOf("export function estimateTextureMemoryBytes"),
      ),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    )
    .replaceAll("export function", "function");
  const resolve = (navigator: { gpu?: object }) =>
    new Function("navigator", source + ";return resolveShaderBackend;")(
      navigator,
    );
  for (const mode of ["full", "ascii-cell"]) {
    assert.equal(resolve({ gpu: {} })("auto", mode), "webgpu");
    assert.equal(resolve({ gpu: {} })("webgl2", mode), "webgl2");
    assert.equal(resolve({})("auto", mode), "webgl2");
    assert.equal(resolve({ gpu: undefined })("auto", mode), "webgl2");
  }
});
