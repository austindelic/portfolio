"""Build local TNS signature drafts; does not send mail or change an account."""
from pathlib import Path
from html import escape
import hashlib
import json

from PIL import Image

BASE = Path(__file__).resolve().parent
CONTACT = json.loads((BASE / "contact.json").read_text())
SOURCE = BASE.parents[1] / "linkedin/ascii-braces/sources/tns-original-6336x1584.png"
BLUE = "#245bff"


def signature(image=False):
    name, title, email, linkedin = [escape(CONTACT[k], quote=True) for k in ("name", "title", "email", "linkedin")]
    logo = ('<img src="cid:tns-wordmark" width="284" height="27" alt="the next something" '
            'style="display:block;width:284px;height:27px;border:0;outline:none;text-decoration:none;">') if image else (
            f'<span style="font-family:Courier New,Courier,monospace;font-size:20px;line-height:28px;'
            f'color:#191919;">the next <span style="color:{BLUE};">{{</span>something'
            f'<span style="color:{BLUE};">}}</span></span>')
    return f'''<!-- Local review draft. Replace [TNS job title], or remove that row.
The logo version requires an inline attachment with Content-ID: <tns-wordmark>,
or a verified public HTTPS image URL. No image hosting or account changes are performed. -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:collapse;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#191919;">
  <tr><td style="padding:0 0 4px;font-size:19px;line-height:24px;mso-line-height-rule:at-least;font-weight:bold;">{name}</td></tr>
  <tr><td style="padding:0 0 10px;font-size:13px;line-height:19px;mso-line-height-rule:at-least;color:#595959;">{title}</td></tr>
  <tr><td style="padding:0 0 4px;font-size:14px;line-height:20px;mso-line-height-rule:at-least;"><a href="mailto:{email}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:{BLUE};text-decoration:underline;">{email}</a></td></tr>
  <tr><td style="padding:0 0 16px;font-size:13px;line-height:20px;mso-line-height-rule:at-least;"><a href="{linkedin}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#595959;text-decoration:underline;">LinkedIn</a></td></tr>
  <tr><td style="padding:12px 0 0;border-top:1px solid #d8e2ff;line-height:28px;mso-line-height-rule:at-least;">{logo}</td></tr>
</table>
'''


def main():
    (BASE / "images").mkdir(exist_ok=True)
    with Image.open(SOURCE) as original:
        assert original.size == (6336, 1584)
        crop = original.convert("RGB").crop((3160, 660, 6000, 930))
        crop.resize((568, 54), Image.Resampling.LANCZOS).save(BASE / "images/tns-wordmark-568x54.png", optimize=True)
    primary, text_only = signature(image=True), signature()
    (BASE / "signature.html").write_text(primary)
    (BASE / "signature-text-only.html").write_text(text_only)
    plain = f'{CONTACT["name"]}\n{CONTACT["title"]}\nthe next something\n{CONTACT["email"]}\nLinkedIn: {CONTACT["linkedin"]}\n'
    (BASE / "signature.txt").write_text(plain)
    local = primary.replace('cid:tns-wordmark', 'images/tns-wordmark-568x54.png')
    (BASE / "preview.html").write_text(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Austin Delic / TNS signature review</title>
<style>body{{margin:0;padding:28px;background:#f3f5fa;color:#191919;font-family:Arial,Helvetica,sans-serif;}}main{{max-width:720px;margin:auto;}}h1{{font-size:22px;line-height:28px;margin:0 0 8px;}}p{{font-size:14px;line-height:21px;margin:0 0 24px;}}h2{{font-size:14px;line-height:20px;font-weight:normal;color:#595959;margin:24px 0 10px;}}.sheet{{padding:28px;background:white;border:1px solid #e0e5ef;}}.reply{{font-size:15px;line-height:23px;margin:0 0 28px;}}@media(max-width:420px){{body{{padding:16px;}}.sheet{{padding:12px;}}}}@media(max-width:350px){{body{{padding:8px;}}.sheet{{padding:8px;}}}}</style></head>
<body><main><h1>TNS email signature</h1><p>Local draft for Austin Delic. The job title is the only displayed placeholder.</p>
<h2>Original TNS wordmark / inline-image version</h2><div class="sheet" id="primary-preview"><div class="reply">Thanks,<br>Austin</div>{local}</div>
<h2>Text-only HTML / no images required</h2><div class="sheet" id="text-preview">{text_only}</div>
<p style="margin-top:20px;color:#595959;">Email HTML uses inline styles and presentation tables. This page is a browser preview; an inbox render has not been tested.</p>
</main></body></html>''')
    (BASE / "asset-provenance.json").write_text(json.dumps({
        "source": str(SOURCE.relative_to(BASE.parents[2])),
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "crop": [3160, 660, 6000, 930], "imageDimensions": [568, 54],
        "displayDimensions": [284, 27], "colour": BLUE,
        "trialFontsUsed": False, "signatureFont": "Arial / Helvetica / sans-serif",
        "textWordmarkFont": "Courier New / Courier / monospace"
    }, indent=2) + "\n")
    assert 'austin@thenextsomething.co' in primary and '[TNS job title]' in primary
    assert '@font-face' not in primary and '<script' not in primary and '<svg' not in primary
    assert '<img' not in text_only and 'mailto:austin@thenextsomething.co' in text_only
    print("Built original-wordmark HTML, text-only HTML, plain-text fallback and local review page.")


if __name__ == "__main__":
    main()
