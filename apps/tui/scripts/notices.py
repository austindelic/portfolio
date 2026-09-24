#!/usr/bin/env python3
"""Generate release dependency notices from the locked Cargo source packages."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--format-version=1', '--manifest-path', str(root / 'Cargo.toml')]))
parts = ['# Third-party notices\n\nThe portfolio application is MIT licensed. Dependencies retain their individual licenses.\n',
         '## Shader sources\n\nThe bundled WGSL shaders derive from the website sources in this repository. The original source header credits:\n\n'
         '- https://github.com/baopinshui/NPGS/blob/master/NPGS/Sources/Engine/Shaders/BlackHole_common.glsl\n'
         '- https://zhuanlan.zhihu.com/p/2003513260645830673\n'
         '- Code rain: https://www.shadertoy.com/view/4t3BWl\n\nThese credits are preserved from the source and do not relicense third-party material.\n']
for pkg in sorted(metadata['packages'], key=lambda p: (p['name'], p['version'])):
    if pkg['source'] is None:
        continue
    folder = Path(pkg['manifest_path']).parent
    parts.append(f"\n## {pkg['name']} {pkg['version']}\n\nLicense: {pkg.get('license') or 'See source license file'}\n\nSource: {pkg.get('repository') or 'https://crates.io/crates/' + pkg['name']}\n")
    candidates = [p for p in folder.iterdir() if p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
    if pkg.get('license_file'):
        candidates.append(folder / pkg['license_file'])
    for candidate in sorted(set(candidates)):
        files = [candidate] if candidate.is_file() else sorted(candidate.rglob('*'))
        for file in files:
            if file.is_file():
                parts.append(f'\n### {file.name}\n\n```text\n{file.read_text(errors="replace")}\n```\n')
(root / 'npm/THIRD_PARTY_NOTICES.md').write_text('\n'.join(parts))
