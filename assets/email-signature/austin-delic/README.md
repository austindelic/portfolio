# Austin Delic / TNS email signature

Open `preview.html` to review the draft. The confirmed address is **austin@thenextsomething.co**. `[TNS job title]` is an explicit placeholder; replace it or remove that table row before using the signature.

- `signature.html`: original TNS wordmark, selectable name/contact text, inline styles and presentation table. Its `cid:tns-wordmark` image needs the included PNG attached inline with Content-ID `<tns-wordmark>`, or the source replaced with a confirmed public HTTPS image URL. The local preview substitutes the packaged PNG only for browser review.
- `signature-text-only.html`: image-independent HTML alternative, with a selectable monospace wordmark and blue braces. It needs no image hosting, inline attachments or downloaded fonts.
- `signature.txt`: plain-text fallback.
- `images/tns-wordmark-568x54.png`: crop from the original banner, displayed at 284 x 27 pixels. Original wordmark and blue braces are preserved; the source banner is unchanged.
- `contact.json`: contact values and sources. Phone and company website remain unknown and are omitted as optional fields.
- `build.py`: local renderer. Run with the bundled Python runtime and Pillow.

The original wordmark is used instead of the trial-font studies. Custom fonts are not needed for either signature. [Custom font support varies across email clients](https://www.caniemail.com/features/css-at-font-face/), so the exact wordmark is packaged as a PNG while all contact text stays editable. [Microsoft's signature guide](https://support.microsoft.com/en-us/outlook/create-an-outlook-signature-block-with-a-photo-and-links-to-facebook-and-x-formerly-twitter) also supports inserting a logo separately when setting up a signature manually.

This is a local review draft. No signature is installed and no email is sent. Browser checks do not establish actual Outlook, Gmail or Apple Mail inbox rendering. No TNS role, phone number, company URL or additional credential has been inferred.
