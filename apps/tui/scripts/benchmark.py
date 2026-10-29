#!/usr/bin/env python3
"""Same-host Unix PTY benchmark. Pass baseline then candidates; emits JSON."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import statistics
import struct
import subprocess
import sys
import tempfile
import termios
import time


def sample(binary, seconds=10):
    with tempfile.TemporaryDirectory() as folder:
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
        metrics = str(Path(folder) / 'metrics.json')
        env = dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor', AUSTINDELIC_DIAGNOSTICS=metrics)
        start = time.monotonic()
        proc = subprocess.Popen([str(Path(binary).resolve()), '--renderer', 'gpu'], stdin=slave, stdout=slave, stderr=slave, env=env)
        output = bytearray()
        startup = None
        last_key = start
        try:
            while time.monotonic() - start < seconds:
                if select.select([master], [], [], .01)[0]:
                    output.extend(os.read(master, 65536))
                    if startup is None and b'Austin' in output:
                        startup = (time.monotonic() - start) * 1000
                if time.monotonic() - last_key > .4:
                    os.write(master, b'\x1b[C')
                    last_key = time.monotonic()
                if proc.poll() is not None:
                    raise RuntimeError(output.decode(errors='replace'))
            os.write(master, b'q')
            deadline = time.monotonic() + 5
            while proc.poll() is None and time.monotonic() < deadline:
                if select.select([master], [], [], .02)[0]:
                    output.extend(os.read(master, 65536))
            assert proc.wait(timeout=1) == 0
            data = json.loads(Path(metrics).read_text())
            assert startup is not None, data
            if seconds >= 10:
                assert data['gpu_frames'] > 0, data
            return {'startupMs': startup, 'fps': data['average_gpu_fps'], 'inputMs': data['max_input_to_draw_ms']}
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            os.close(master)
            os.close(slave)


if __name__ == '__main__':
    results = {binary: [] for binary in sys.argv[1:]}
    startup_samples = {binary: [] for binary in results}
    for binary in results:
        sample(binary, seconds=2)
    # Millisecond-scale startup is noisier than throughput; use seven samples.
    for _ in range(7):
        for binary in results:
            startup_samples[binary].append(sample(binary, seconds=1)['startupMs'])
    # Interleave builds to reduce temperature/order bias; discard one warm-up.
    for _ in range(3):
        for binary in results:
            results[binary].append(sample(binary))
    summary = {binary: {key: statistics.median(s[key] for s in samples) for key in samples[0]} for binary, samples in results.items()}
    for binary in summary:
        summary[binary]['startupMs'] = statistics.median(startup_samples[binary])
    baseline = summary[sys.argv[1]]
    for data in summary.values():
        data['passes'] = data['fps'] >= baseline['fps'] * .9 and data['startupMs'] <= baseline['startupMs'] * 1.1 and data['inputMs'] <= baseline['inputMs'] * 1.1
    print(json.dumps({'medians': summary, 'samples': results, 'startupSamples': startup_samples}, indent=2))
