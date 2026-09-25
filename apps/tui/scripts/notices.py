#!/usr/bin/env python3
"""Generate release dependency notices from the locked Cargo source packages."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--format-version=1', '--manifest-path', str(root / 'Cargo.toml')]))
parts = ['# Third-party notices\n\nThe distributed portfolio application is GPL-3.0-only licensed. Dependencies retain their individual licenses.\n',
         '## Shader sources\n\nThe bundled WGSL shaders are distributed by austindelic-blackhole. The original source header credits:\n\n'
         '- https://github.com/baopinshui/NPGS/blob/master/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl\n'
         '- https://zhuanlan.zhihu.com/p/2003513260645830673\n'
         '\nThe unverified Shadertoy code-rain effect is not included in Blackhole 0.1.0.\n']
texts = {}
expanded = list(parts)
for pkg in sorted(metadata['packages'], key=lambda p: (p['name'], p['version'])):
    if pkg['source'] is None:
        continue
    folder = Path(pkg['manifest_path']).parent
    parts.append(f"\n## {pkg['name']} {pkg['version']}\n\nLicense: {pkg.get('license') or 'See source license file'}\n\nSource: {pkg.get('repository') or 'https://crates.io/crates/' + pkg['name']}\n")
    expanded.append(parts[-1])
    candidates = [p for p in folder.iterdir() if p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
    if pkg.get('license_file'):
        candidates.append(folder / pkg['license_file'])
    for candidate in sorted(set(candidates)):
        files = [candidate] if candidate.is_file() else sorted(candidate.rglob('*'))
        for file in files:
            if file.is_file():
                content = file.read_text(errors="replace")
                key = hashlib.sha256(content.encode()).hexdigest()
                texts[key] = content
                parts.append(f'\n### {file.name}\n\n[Full license / notice text](#notice-{key})\n')
                expanded.append(f'\n### {file.name}\n\n```text\n{content}\n```\n')
# Retain every distinct notice verbatim, sharing only byte-identical texts.
for key, content in texts.items():
    parts.append(f'\n<a id="notice-{key}"></a>\n\n## License / notice text {key[:12]}\n\n```text\n{content}\n```\n')
baseline = root.parents[1] / 'release/baseline-notices.md'
baseline.parent.mkdir(parents=True, exist_ok=True)
baseline.write_text('\n'.join(expanded))
(root / 'npm/THIRD_PARTY_NOTICES.md').write_text('\n'.join(parts))
