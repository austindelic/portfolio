# TNS signature: one image

Type **Thanks,** in your message. Place the single signature image underneath it. The PNG already contains Austin's name, confirmed TNS email, LinkedIn label and original TNS wordmark. It contains no greeting, title placeholder, phone number or inferred company URL.

- `austin-delic-tns-440x160.png`: compact PNG at intended display size.
- `austin-delic-tns-1760x640.png`: crisp 4x PNG; insert it at **440 x 160**, rather than its native dimensions.
- `preview.html`: local review, with the typed greeting outside the image.
- `signature.html`: one linked image with descriptive alt text. Clicking the image opens a message to **austin@thenextsomething.co**. The LinkedIn handle is printed within the image; it is not a separate clickable region.
- `signature.txt`: plain-text fallback, without a greeting.
- `signature-artwork.svg`: editable real ASCII and contact text, plus the original wordmark raster. Requires Departure Mono locally; no font files are embedded.
- `render.py`, `config.json`, `ascii-cells.json`: deterministic source and layout configuration. Use the repository's existing Departure Mono file, or set `TNS_SIGNATURE_FONT` to a matching font file. Rebuilding also requires the original banner at the configured repository path.

The email HTML uses `cid:tns-austin-signature`. For a manual setup, insert the supplied PNG through your email client's image control, set its display size, and link it to `mailto:austin@thenextsomething.co`. For programmatic MIME assembly, attach the 4x PNG inline with Content-ID `<tns-austin-signature>`. An independently confirmed HTTPS image URL can replace the CID source if desired. No hosting, account installation or sending has been performed.

The SVG and image use Departure Mono for actual font characters. The opening brace dissolves toward the left; the closing brace stays intact. Trial fonts and generated artwork are not used. The earlier signature draft remains in the parent directory.

Browser previews and dimension/link checks do not establish rendering in Outlook, Gmail or Apple Mail. Those inboxes remain untested.
