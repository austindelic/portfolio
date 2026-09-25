import type { mountBlackHole } from "@austindelic/blackhole";

type Runtime = ReturnType<typeof mountBlackHole>;

export function bindBlackHoleExplore(getRuntime: () => Runtime | undefined) {
	const trigger = document.querySelector<HTMLButtonElement>(
		"[data-explore-trigger]",
	);
	const overlay = document.querySelector<HTMLElement>("#black-hole-explore");
	const foreground = document.querySelector<HTMLElement>(
		".bh-foreground-layer",
	);
	if (!trigger || !overlay || !foreground) return () => {};
	const abort = new AbortController();
	const options = { signal: abort.signal };
	const eligible = matchMedia(
		"(width > 768px) and (height > 768px) and (pointer: fine)",
	);
	const toggle = overlay.querySelector<HTMLButtonElement>(
		"[data-explore-settings]",
	);
	const panel = overlay.querySelector<HTMLElement>("#explore-settings-content");
	const ascii = overlay.querySelector<HTMLInputElement>("#explore-ascii");
	const resolution = overlay.querySelector<HTMLInputElement>(
		"#explore-resolution",
	);
	const resolutionOutput = overlay.querySelector<HTMLOutputElement>(
		'output[for="explore-resolution"]',
	);
	if (!toggle || !panel || !ascii || !resolution || !resolutionOutput)
		return () => {};
	let active = false;
	let scrollX = 0,
		scrollY = 0;
	let previousInert = false;
	let runtime: Runtime | undefined;
	const closeSettings = () => {
		panel.hidden = true;
		toggle.setAttribute("aria-expanded", "false");
	};
	const exit = () => {
		if (!active) return;
		active = false;
		runtime?.exitExploration();
		overlay.hidden = true;
		closeSettings();
		foreground.inert = previousInert;
		document.body.classList.remove("bh-exploring");
		trigger.setAttribute("aria-expanded", "false");
		window.scrollTo(scrollX, scrollY);
		if (eligible.matches) trigger.focus({ preventScroll: true });
	};
	trigger.addEventListener(
		"click",
		() => {
			runtime = getRuntime();
			if (!eligible.matches || active || !runtime?.enterExploration()) return;
			active = true;
			scrollX = window.scrollX;
			scrollY = window.scrollY;
			previousInert = foreground.inert;
			foreground.inert = true;
			document.body.classList.add("bh-exploring");
			closeSettings();
			for (const input of overlay.querySelectorAll<HTMLInputElement>(
				"input[data-setting]",
			)) {
				input.value = input.defaultValue;
				input.dispatchEvent(new Event("input"));
			}
			const renderSettings = runtime.getExploreRenderSettings();
			if (renderSettings) {
				ascii.checked = renderSettings.asciiEnabled;
				resolution.value = String(Math.round(renderSettings.sourceScale * 100));
				resolutionOutput.value = `${resolution.value}%`;
			}
			overlay.hidden = false;
			trigger.setAttribute("aria-expanded", "true");
			overlay.focus({ preventScroll: true });
		},
		options,
	);
	overlay
		.querySelector("[data-explore-exit]")
		?.addEventListener("click", exit, options);
	overlay.querySelector("[data-explore-reset]")?.addEventListener(
		"click",
		() => {
			runtime?.resetExploration();
			overlay.focus({ preventScroll: true });
		},
		options,
	);
	toggle.addEventListener(
		"click",
		() => {
			panel.hidden = !panel.hidden;
			toggle.setAttribute("aria-expanded", String(!panel.hidden));
		},
		options,
	);
	for (const input of overlay.querySelectorAll<HTMLInputElement>(
		"input[data-setting]",
	)) {
		input.addEventListener(
			"input",
			() => {
				const key = input.dataset.setting as
					| "timeScale"
					| "exposure"
					| "bloomStrength";
				const output = overlay.querySelector<HTMLOutputElement>(
					`output[for="${input.id}"]`,
				);
				if (output)
					output.value = input.value + (key === "timeScale" ? "×" : "");
				if (active) runtime?.updateControls({ [key]: Number(input.value) });
			},
			options,
		);
	}
	ascii.addEventListener(
		"change",
		() => {
			if (active)
				runtime?.updateExploreRenderSettings({ asciiEnabled: ascii.checked });
		},
		options,
	);
	resolution.addEventListener(
		"input",
		() => {
			resolutionOutput.value = `${resolution.value}%`;
			if (active)
				runtime?.updateExploreRenderSettings({
					sourceScale: Number(resolution.value) / 100,
				});
		},
		options,
	);
	// Give keyboard movement back to the scene after clicking it.
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (active && event.target instanceof HTMLCanvasElement)
				overlay.focus({ preventScroll: true });
		},
		options,
	);
	document.addEventListener(
		"keydown",
		(event) => {
			if (!active) return;
			if (event.key === "Escape") {
				event.preventDefault();
				if (!panel.hidden) {
					closeSettings();
					toggle.focus();
				} else exit();
			}
			if (event.key === "Tab") {
				const items = [
					...overlay.querySelectorAll<HTMLElement>("button, input"),
				].filter((el) => el.getClientRects().length);
				const index = items.indexOf(document.activeElement as HTMLElement);
				event.preventDefault();
				items[
					index < 0
						? event.shiftKey
							? items.length - 1
							: 0
						: (index + (event.shiftKey ? -1 : 1) + items.length) % items.length
				]?.focus();
			}
		},
		options,
	);
	eligible.addEventListener(
		"change",
		() => {
			if (!eligible.matches) exit();
		},
		options,
	);
	document.addEventListener("black-hole-explore-end", exit, options);
	document.addEventListener("astro:before-preparation", exit, options);
	window.addEventListener("pagehide", exit, options);
	return () => {
		exit();
		abort.abort();
	};
}
