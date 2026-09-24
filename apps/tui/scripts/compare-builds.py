#!/usr/bin/env python3
"""Build a baseline and six size candidates without modifying Cargo profiles.

Run from the repository root. Output goes to release/size-study by default.
Use benchmark.py on the emitted executables on a machine with a real GPU.
"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

root = Path('apps/tui')
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'release/size-study')
out.mkdir(parents=True, exist_ok=True)


def source_hash():
    digest = hashlib.sha256()
    for name in ['Cargo.toml', 'Cargo.lock']:
        digest.update((root / name).read_bytes())
    for folder in ['cli', 'core', 'renderer']:
        for file in sorted((root / folder).rglob('*')):
            if file.is_file():
                digest.update(str(file).encode())
                digest.update(file.read_bytes())
    return digest.hexdigest()


revision = source_hash()
results = []
configs = [('baseline', '3', 'false', '16', 'none')]
configs += [(f'{lto}-{opt}', opt, lto, '1', 'symbols') for lto in ['thin', 'fat'] for opt in ['3', 's', 'z']]
for name, opt, lto, units, strip in configs:
    env = dict(os.environ, CARGO_PROFILE_RELEASE_OPT_LEVEL=opt, CARGO_PROFILE_RELEASE_LTO=lto, CARGO_PROFILE_RELEASE_CODEGEN_UNITS=units, CARGO_PROFILE_RELEASE_STRIP=strip, CARGO_PROFILE_RELEASE_PANIC='unwind')
    start = time.monotonic()
    with (out / f'{name}.log').open('w') as log:
        subprocess.run(['cargo', 'build', '--locked', '--release', '--manifest-path', str(root / 'Cargo.toml'), '-p', 'austindelic', '--bin', 'austindelic'], env=env, stdout=log, stderr=log, check=True)
    if source_hash() != revision:
        raise RuntimeError('Source changed during comparison; rerun on a stable source snapshot')
    suffix = '.exe' if os.name == 'nt' else ''
    binary = out / (name + suffix)
    shutil.copy2(root / 'target/release' / ('austindelic' + suffix), binary)
    data = binary.read_bytes()
    results.append(dict(name=name, bytes=len(data), gzipBytes=len(gzip.compress(data, mtime=0)), buildSeconds=round(time.monotonic()-start, 1), sourceHash=revision))
    (out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(results[-1], flush=True)
