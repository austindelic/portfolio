import { renderPixels } from "./pixels";
import {
	defaults,
	faceCrop,
	getPreset,
	type PortraitSettings,
	palettes,
	presets,
	readSettings,
	settingsURL,
} from "./settings";

export async function mountPortrait(): Promise<() => void> {
	const lab = document.querySelector<HTMLElement>("[data-portrait-lab]");
	const template = document.querySelector<HTMLTemplateElement>(
		"[data-portrait-template]",
	);
	const about = document.querySelector<HTMLElement>("#about");
	let home: HTMLElement | null = null;
	let toolbar: HTMLElement | null = null;
	if (!lab && template && about) {
		const fragment = template.content.cloneNode(true) as DocumentFragment;
		home = fragment.querySelector<HTMLElement>("[data-home-portrait]");
		toolbar = fragment.querySelector<HTMLElement>(".portrait-home-toolbar");
		about.before(fragment);
		if (toolbar) about.before(toolbar);
	}
	const rootNode = lab ?? home;
	if (!rootNode) return () => {};
	const root = rootNode;
	const abort = new AbortController();
	const { signal } = abort;
	let settings = readSettings(new URLSearchParams(location.search));
	let pendingFrame = 0;
	let disposed = false;
	const cleanup = () => {
		disposed = true;
		abort.abort();
		cancelAnimationFrame(pendingFrame);
		home?.remove();
		toolbar?.remove();
		if (about) delete about.dataset.portraitPlacement;
	};
	const frameNode = root.querySelector<HTMLElement>("[data-portrait-frame]");
	const canvasNode = frameNode?.querySelector<HTMLCanvasElement>("canvas");
	const contextNode = canvasNode?.getContext("2d");
	const originalNode =
		frameNode?.querySelector<HTMLImageElement>(".portrait-original");
	const revealButton = root.querySelector<HTMLButtonElement>(
		"[data-reveal-button]",
	);
	const form = root.querySelector<HTMLFormElement>("[data-portrait-controls]");
	const status = root.querySelector<HTMLElement>("[data-portrait-status]");
	const message = (text: string) => {
		if (status) status.textContent = text;
	};
	if (!canvasNode || !contextNode || !frameNode || !originalNode) {
		message("Canvas is unavailable. Browse the printed treatments below.");
		return cleanup;
	}

	const frame = frameNode;
	const canvas = canvasNode;
	const context = contextNode;
	const original = originalNode;
	// Position and label the printed fallback even if image decoding fails.
	sync();
	const image = new Image();
	image.src = "/images/portraits/profile.webp";
	try {
		await image.decode();
	} catch {
		message(
			"The source photograph could not load. Browse the printed treatments below.",
		);
		return cleanup;
	}
	if (!root.isConnected) {
		cleanup();
		return cleanup;
	}
	const sourceCache = new Map<string, Uint8ClampedArray>();
	const sourcePixels = () => {
		const cached = sourceCache.get(settings.crop);
		if (cached) return cached;
		const sampler = document.createElement("canvas");
		sampler.width = canvas.width;
		sampler.height = canvas.height;
		const samplerContext = sampler.getContext("2d", {
			willReadFrequently: true,
		});
		if (!samplerContext) throw new Error("Could not sample portrait");
		const crop =
			settings.crop === "face" ? faceCrop : { left: 0, top: 0, size: 1 };
		samplerContext.drawImage(
			image,
			image.width * crop.left,
			image.height * crop.top,
			image.width * crop.size,
			image.height * crop.size,
			0,
			0,
			canvas.width,
			canvas.height,
		);
		const pixels = samplerContext.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		).data;
		sourceCache.set(settings.crop, pixels);
		return pixels;
	};
	function placePortrait() {
		if (!home || !about) return;
		const copy = about.querySelector<HTMLElement>(".identity-copy");
		const grid = about.querySelector<HTMLElement>(".identity-grid");
		about.dataset.portraitPlacement = settings.placement;
		home.dataset.placement = settings.placement;
		if (settings.placement === "card") copy?.append(home);
		else if (settings.placement === "side") grid?.prepend(home);
		else if (settings.placement === "badge") copy?.prepend(home);
		else about.before(home);
	}
	function sync() {
		const preset = getPreset(settings.preset);
		for (const node of root.querySelectorAll<HTMLElement>(
			"[data-portrait-name], [data-selected-name]",
		))
			node.textContent = preset.name;
		const description = root.querySelector("[data-selected-description]");
		if (description) description.textContent = preset.description;
		const index = root.querySelector("[data-selected-index]");
		if (index)
			index.textContent = `${String(presets.indexOf(preset) + 1).padStart(2, "0")} / 12`;
		for (const button of root.querySelectorAll<HTMLElement>("[data-preset]"))
			button.setAttribute(
				"aria-pressed",
				String(button.dataset.preset === settings.preset),
			);
		if (form)
			for (const [key, value] of Object.entries(settings)) {
				const input = form.elements.namedItem(key);
				if (input instanceof HTMLInputElement) {
					if (input.type === "checkbox") input.checked = Boolean(value);
					else input.value = String(value);
				} else if (input instanceof HTMLSelectElement)
					input.value = String(value);
				const output = form.querySelector(`[data-value="${key}"]`);
				if (output)
					output.textContent =
						typeof value === "number" && key !== "grain"
							? value.toFixed(2)
							: String(value);
			}
		frame.dataset.scanlines = String(settings.scanlines);
		frame.dataset.tilt = String(settings.tilt);
		frame.dataset.reveal = String(settings.reveal);
		frame.classList.remove("is-revealed");
		frame.style.setProperty("--tilt-x", "0deg");
		frame.style.setProperty("--tilt-y", "0deg");
		original.src = `/images/portraits/${settings.crop === "face" ? "face" : "profile"}.webp`;
		original.hidden = !settings.reveal;
		if (revealButton) {
			revealButton.hidden = !settings.reveal;
			revealButton.textContent = "Show original";
			revealButton.setAttribute("aria-pressed", "false");
		}
		const fallback = root.querySelector<HTMLImageElement>(".portrait-fallback");
		if (fallback) {
			fallback.src = `/images/portraits/${preset.id}.webp`;
			fallback.alt = `Portrait of Austin smiling by the ocean, wearing a cap. ${preset.name} treatment.`;
		}
		for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
			"[data-home-preview]",
		))
			anchor.href = settingsURL(settings, "/", location.origin).href;
		const back =
			toolbar?.querySelector<HTMLAnchorElement>("[data-back-to-lab]");
		if (back)
			back.href = settingsURL(settings, "/portrait-lab", location.origin).href;
		placePortrait();
	}
	function draw() {
		pendingFrame = 0;
		if (disposed) return;
		const pixels = renderPixels(
			sourcePixels(),
			canvas.width,
			canvas.height,
			settings,
		);
		const bitmap = context.createImageData(canvas.width, canvas.height);
		bitmap.data.set(pixels);
		context.putImageData(bitmap, 0, 0);
		canvas.hidden = false;
		frame.dataset.ready = "true";
	}
	function update(next: PortraitSettings) {
		settings = next;
		sync();
		// Coalesce slider input. No rendering loop runs after this draw.
		if (!pendingFrame) pendingFrame = requestAnimationFrame(draw);
		const url = settingsURL(
			settings,
			lab ? "/portrait-lab" : "/",
			location.origin,
		);
		history.replaceState(history.state, "", url);
		message("");
	}
	form?.addEventListener("submit", (event) => event.preventDefault(), {
		signal,
	});
	form?.addEventListener(
		"input",
		() => {
			const params = settingsURL(
				settings,
				"/portrait-lab",
				location.origin,
			).searchParams;
			for (const element of Array.from(form.elements)) {
				if (
					element instanceof HTMLInputElement ||
					element instanceof HTMLSelectElement
				) {
					if (element.name)
						params.set(
							element.name,
							element instanceof HTMLInputElement && element.type === "checkbox"
								? element.checked
									? "1"
									: "0"
								: element.value,
						);
				}
			}
			update(readSettings(params));
		},
		{ signal },
	);
	root.addEventListener(
		"click",
		async (event) => {
			const button = (event.target as Element).closest<HTMLElement>(
				"[data-preset], [data-action]",
			);
			if (!button) return;
			if (button.dataset.preset) {
				update({
					...defaults(button.dataset.preset),
					placement: settings.placement,
				});
				message(`${getPreset(settings.preset).name} selected.`);
				root
					.querySelector(".portrait-workbench")
					?.scrollIntoView({ block: "start" });
			} else if (button.dataset.action === "reset") {
				update(defaults(settings.preset));
				message("Preset settings restored.");
			} else if (button.dataset.action === "randomize") {
				const preset =
					presets[Math.floor(Math.random() * (presets.length - 1))];
				const paletteIds = Object.keys(
					palettes,
				) as PortraitSettings["palette"][];
				const next = defaults(preset.id);
				update({
					...next,
					palette: paletteIds[Math.floor(Math.random() * paletteIds.length)],
					grain: Math.max(
						1,
						Math.min(12, next.grain + Math.round(Math.random() * 4 - 2)),
					),
					contrast: Number((1 + Math.random() * 0.55).toFixed(2)),
					brightness: Number((Math.random() * 0.12 - 0.06).toFixed(2)),
					placement: settings.placement,
				});
				message(`Trying ${getPreset(settings.preset).name}.`);
			} else if (button.dataset.action === "copy") {
				const url = settingsURL(settings, "/", location.origin).href;
				try {
					await navigator.clipboard.writeText(url);
					message("Homepage preview link copied.");
				} catch {
					const fallback = root.querySelector<HTMLElement>(
						"[data-copy-fallback]",
					);
					const input = fallback?.querySelector("input");
					if (fallback && input) {
						fallback.hidden = false;
						input.value = url;
						input.focus();
						input.select();
					}
					message("Select and copy the preview link below.");
				}
			}
		},
		{ signal },
	);
	revealButton?.addEventListener(
		"click",
		() => {
			const revealed = frame.classList.toggle("is-revealed");
			revealButton.setAttribute("aria-pressed", String(revealed));
			revealButton.textContent = revealed ? "Show treatment" : "Show original";
		},
		{ signal },
	);
	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	frame.addEventListener(
		"pointermove",
		(event) => {
			if (!settings.tilt || motion.matches || event.pointerType === "touch")
				return;
			const bounds = frame.getBoundingClientRect();
			frame.style.setProperty(
				"--tilt-x",
				`${((event.clientY - bounds.top) / bounds.height - 0.5) * -7}deg`,
			);
			frame.style.setProperty(
				"--tilt-y",
				`${((event.clientX - bounds.left) / bounds.width - 0.5) * 7}deg`,
			);
		},
		{ signal },
	);
	frame.addEventListener(
		"pointerleave",
		() => {
			frame.style.setProperty("--tilt-x", "0deg");
			frame.style.setProperty("--tilt-y", "0deg");
		},
		{ signal },
	);
	sync();
	draw();
	const fieldset = form?.querySelector("fieldset");
	if (fieldset) fieldset.disabled = false;
	return cleanup;
}
