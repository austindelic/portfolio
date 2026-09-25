interface Session {
  state: { animationRoute?: string };
  options: { onReady(): void };
  disposals: number;
  routes: string[];
  dispose(): void;
  updateRoute(route: string): void;
}
interface Host {
  dataset: { settings: string; bhLive?: string };
  isConnected: boolean;
  querySelector(selector: string): object;
}
interface FixtureEvent {
  persisted?: boolean;
  newDocument?: { querySelector(): Host | null };
}
interface Events {
  listeners: Record<string, (event?: FixtureEvent) => unknown>;
  addEventListener(name: string, fn: (event?: FixtureEvent) => unknown): void;
  emit(name: string, event?: FixtureEvent): unknown;
}
interface Binding {
  active: boolean;
  getRuntime(): Session | undefined;
}
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const component = await readFile(
  new URL("../../src/components/BlackHoleBackground.astro", import.meta.url),
  "utf8",
);
const script = ts
  .transpile(component.split("<script>")[1].split("</script>")[0], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  })
  .replace('import("./BlackHoleRuntime")', "load()")
  .replace('import { bindBlackHoleExplore } from "./BlackHoleExplore";', "")
  .replace("export {};", "");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(mobile = true) {
  const events = (): Events => ({
    listeners: {},
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    emit(name, event) {
      return this.listeners[name]?.(event);
    },
  });
  const media = { ...events(), matches: mobile };
  const error = { hidden: true };
  let replacements = 0;
  const canvas = {
    cloneNode: () => ({}),
    replaceWith() {
      replacements++;
    },
  };
  const host: Host = {
    dataset: { settings: "{}" },
    isConnected: true,
    querySelector: (selector: string) =>
      selector === "canvas" ? canvas : error,
  };
  const document = { ...events(), querySelector: () => host };
  const window = { ...events(), matchMedia: () => media };
  const location = { pathname: "/" };
  const bindings: Binding[] = [];
  const sessions: Session[] = [],
    loads: (() => void)[] = [];
  const module = {
    createRuntimeState: (props: object) => props,
    runtimeOptions: (_props: object, onError: (error: unknown) => void) => ({
      onError,
    }),
    mountBlackHoleRuntime(
      _canvas: object,
      state: Session["state"],
      options: Session["options"],
    ) {
      const session: Session = {
        state,
        options,
        disposals: 0,
        routes: [],
        dispose() {
          assert.ok(
            bindings.every((binding) => !binding.active),
            "Explore must exit before disposal",
          );
          this.disposals++;
        },
        updateRoute(route: string) {
          this.routes.push(route);
        },
      };
      sessions.push(session);
      return session;
    },
  };
  new Function(
    "window",
    "document",
    "location",
    "load",
    "bindBlackHoleExplore",
    script,
  )(
    window,
    document,
    location,
    () => new Promise((resolve) => loads.push(() => resolve(module))),
    (getRuntime: Binding["getRuntime"]) => {
      assert.ok(
        bindings.every((binding) => !binding.active),
        "Only one Explore binding may be active",
      );
      const binding = { active: true, getRuntime };
      bindings.push(binding);
      return () => {
        binding.active = false;
      };
    },
  );
  return {
    media,
    host,
    window,
    document,
    location,
    sessions,
    loads,
    bindings,
    replacements: () => replacements,
  };
}

test("mobile navigation and page restoration never load the renderer", async () => {
  const f = fixture();
  f.location.pathname = "/blog";
  await f.document.emit("astro:page-load");
  f.window.emit("pagehide", { persisted: true });
  await f.window.emit("pageshow", { persisted: true });
  assert.equal(f.loads.length, 0);
  assert.equal(f.sessions.length, 0);
});

test("switching to mobile invalidates an in-flight desktop import", async () => {
  const f = fixture(false);
  f.media.matches = true;
  await f.media.emit("change");
  f.loads[0]();
  await flush();
  assert.equal(f.sessions.length, 0);
  f.media.matches = false;
  f.media.emit("change");
  f.loads[1]();
  await flush();
  assert.equal(f.sessions.length, 1);
});

test("desktop retains one session across routes and disposes it on mobile", async () => {
  const f = fixture(false);
  f.loads[0]();
  await flush();
  f.sessions[0].options.onReady();
  assert.equal(f.host.dataset.bhLive, "true");
  f.location.pathname = "/socials";
  await f.document.emit("astro:page-load");
  assert.deepEqual(f.sessions[0].routes, ["/socials"]);
  assert.equal(f.loads.length, 1);
  f.media.matches = true;
  await f.media.emit("change");
  assert.equal(f.sessions[0].disposals, 1);
  assert.equal(f.host.dataset.bhLive, undefined);
  assert.equal(f.replacements(), 1);
  f.sessions[0].options.onReady();
  assert.equal(f.host.dataset.bhLive, undefined);
});

test("route changes during import start at the latest route; leaving cancels startup", async () => {
  const f = fixture(false);
  f.location.pathname = "/blog";
  await f.document.emit("astro:page-load");
  f.loads[0]();
  await flush();
  assert.equal(f.sessions[0].state.animationRoute, "/blog");
  const pending = fixture(false);
  pending.document.emit("astro:before-swap", {
    newDocument: { querySelector: () => null },
  });
  pending.loads[0]();
  await flush();
  assert.equal(pending.sessions.length, 0);
});

test("bfcache pagehide disposes desktop and pageshow starts a fresh session", async () => {
  const f = fixture(false);
  f.loads[0]();
  await flush();
  f.window.emit("pagehide", { persisted: true });
  assert.equal(f.sessions[0].disposals, 1);
  f.window.emit("pageshow", { persisted: true });
  f.loads[1]();
  await flush();
  assert.equal(f.sessions.length, 2);
});

test("Explore resolves the lazy runtime and rebinds after a persisted page swap", async () => {
  const f = fixture(false);
  assert.equal(f.bindings[0].getRuntime(), undefined);
  f.loads[0]();
  await flush();
  assert.equal(f.bindings[0].getRuntime(), f.sessions[0]);
  f.document.emit("astro:before-swap", {
    newDocument: { querySelector: () => f.host },
  });
  assert.equal(f.bindings[0].active, false);
  assert.equal(f.sessions[0].disposals, 0);
  await f.document.emit("astro:page-load");
  assert.equal(f.bindings.length, 2);
  assert.equal(f.bindings[1].active, true);
  assert.equal(f.bindings[1].getRuntime(), f.sessions[0]);
  f.window.emit("pagehide", { persisted: true });
  assert.equal(f.bindings[1].active, false);
  assert.equal(f.sessions[0].disposals, 1);
});
