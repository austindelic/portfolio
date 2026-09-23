# Resume source

Edit `content.json` for content or `resume.typ` for layout, then regenerate the
public PDF. Requires Python 3 and Typst 0.15.1 on PATH:

```sh
python3 apps/portfolio/resume/generate.py
```

The generator writes `apps/portfolio/public/resume.pdf`, served at `/resume.pdf`.
It uses Typst's bundled Libertinus Serif family (matching the original resume),
embeds regular, bold and italic fonts, and sets deterministic metadata. System
fonts are ignored to make builds consistent. Layouts longer than one A4 page
are rejected without overwriting the existing PDF. No web runtime dependency
is added. The layout restores the original's serif headings, italic roles,
right-aligned dates and black section rules.

After editing, use `pdfinfo` to check page count and size, `pdftotext` to inspect
reading order, and `pdftoppm -scale-to 1600 -png -singlefile` to render the PDF for
visual inspection. Check the portfolio navigation's resume link locally.

## Content provenance (23 September 2026)

- User-supplied LinkedIn profile: current employer, employment dates, degree,
  marks, Letter of Commendation, LaunchLAB participation and scholarship.
- The Next Something: title and dates only, explicitly requested by Austin.
- Lightbulb Skills: title from the supplied LinkedIn skills section; dates and
  CRM description retained from the previous local resume.
- Previous local resume and portfolio project articles: Scrypt engineering
  contributions, Tactify and Still technical details.
- VisagioX third place: teammate and judge posts in the supplied profile,
  corroborated by the [judge's public post](https://www.linkedin.com/posts/rusthom_visagioxhackathon-perth-wainnovation-activity-7449342729861509120-3ndH).

The current LinkedIn profile takes precedence over older search results. The
Swift Student Challenge claim is excluded because it was not substantiated by
the supplied profile. Personal health details and private profile analytics are
not part of the resume.
