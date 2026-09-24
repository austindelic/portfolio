---
publishDate: 2026-07-08
title: "Building Tactify"
description: "Notes on turning an accessibility problem into an AI product that converts visual learning material into tactile graphics and guided audio."
published: true
tags:
  - accessibility
  - ai
  - product
---

Tactify started as a simple frustration: a lot of learning material assumes vision as the default interface.

Worksheets, diagrams, charts, and classroom handouts often carry the real explanation in layout, arrows, shape, labels, and visual grouping. If you cannot inspect that visual structure directly, the material is not just inconvenient. It is incomplete.

I wanted to explore whether AI could help translate that visual structure into something more tactile and navigable. Not just "describe this image", but turn the image into a set of artifacts someone could actually use: simplified tactile-ready SVG graphics and guided audio narration that explains how to explore them.

The first version of Tactify is built around that pipeline.

An uploaded visual document moves through several stages:

```txt
image -> simplify -> vectorize -> script -> audio -> experience
```

The product surface is a Next.js and React workspace for upload, review, and playback. The backend is Go, with typed API contracts and a processing flow that can treat the work as more than a single request-response action. That matters because document transformation has a lot of failure points: image quality, text density, diagram complexity, AI output quality, and audio generation.

The goal is not to make the system pretend every image is easy. The goal is to create a pipeline where each stage has a clear responsibility.

The image processing layer handles simplification and conversion. ImageMagick is useful for preparing high-contrast monochrome assets. vtracer can take raster output and produce SVG paths. Gemini helps interpret the document and generate the narration structure. Text-to-speech turns that structure into audio that can be played alongside the tactile graphic.

The interesting product problem is deciding what to preserve.

A tactile graphic cannot carry the same density as a full visual diagram. If you preserve everything, you create noise. If you simplify too aggressively, you lose the concept. Tactify has to bias toward structure: major shapes, labels, groupings, direction, and relationships. In other words, the system should not just process pixels. It should preserve the idea the visual was trying to teach.

That is where the audio layer becomes important. The tactile SVG can give spatial structure, while narration can guide exploration:

```txt
Start at the top-left corner.
Follow the main arrow toward the center.
The largest circle represents the system boundary.
Three smaller nodes inside it show the input, processor, and output.
```

That kind of script is more useful than a generic caption because it gives the user a route through the graphic. It can describe where to begin, what to touch next, and how the parts relate.

I built the early version during Perth Hackerhouse. That setting shaped the project. It pushed the work away from a polished pitch and toward a working product surface. What is the smallest thing that proves the idea? Can someone upload an image? Can the backend produce useful artifacts? Can the frontend present them as an experience instead of a pile of files?

The answer does not need to be perfect for the project to be worth building. Accessibility tools are allowed to start rough, as long as the direction is honest. A weak prototype that turns one worksheet into a more navigable experience is better than a beautiful deck about inclusion.

The engineering work is also broader than the AI call. A useful version needs authentication, object storage, durable records, typed APIs, safe file handling, a queueable processing model, and browser-compatible audio output. It needs to explain failure clearly when a document is too complex. It needs a review loop, because automatic transformations should be editable.

The core lesson so far: accessibility is not a feature layer. It changes the shape of the product.

If the user is blind or low-vision, the "main interface" is not just the screen. It might be touch, audio, keyboard navigation, file export, or a teacher preparing material before class. That forces better product thinking. You cannot hide behind a nice visual layout. The system has to make its structure explicit.

That is why Tactify is still interesting to me. It sits at the intersection of product, backend systems, AI, and a problem that is easy to ignore if you are not affected by it.

There is a lot left to solve: better diagram understanding, cleaner SVG generation, human editing tools, export formats, and more reliable narration. But the direction feels right.

Make visual information tactile. Make diagrams explorable. Make the hidden structure available to more people.
