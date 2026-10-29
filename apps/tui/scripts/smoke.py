# Run with: uv run --with pyte scripts/smoke.py /absolute/path/to/austindelic
import os,sys,pty,termios,fcntl,struct,subprocess,time,select,signal,tempfile,json,html
from pathlib import Path
import pyte
binary=str(Path(sys.argv[1]).resolve())
out=Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/austindelic-smoke');out.mkdir(parents=True,exist_ok=True)
def run_case(name,args,exit_key=b'q',gpu=False):
    master,slave=pty.openpty();original=termios.tcgetattr(slave)
    fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
    screen=pyte.Screen(120,40);stream=pyte.ByteStream(screen);raw=bytearray()
    env=dict(os.environ,TERM='xterm-256color',COLORTERM='truecolor',AUSTINDELIC_DIAGNOSTICS=str(out/f'{name}-metrics.json'))
    env.pop("NO_COLOR",None)
    wrapper = """import subprocess,sys,termios,json,signal
original=termios.tcgetattr(0)
child=subprocess.Popen(sys.argv[2:])
for sig in (signal.SIGTERM,signal.SIGHUP,signal.SIGINT):signal.signal(sig,lambda sig,frame:child.send_signal(sig))
code=child.wait()
with open(sys.argv[1],'w') as f:json.dump({'restored':termios.tcgetattr(0)==original,'code':code},f)
sys.exit(code)
"""
    proc=subprocess.Popen([sys.executable,'-c',wrapper,str(out/f'{name}-cleanup.json'),binary,*args],stdin=slave,stdout=slave,stderr=slave,start_new_session=True,env=env,preexec_fn=lambda:fcntl.ioctl(slave,termios.TIOCSCTTY,0))
    def pump(seconds):
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            if select.select([master],[],[],min(.02,max(0,end-time.monotonic())))[0]:
                try:data=os.read(master,1048576)
                except OSError:break
                raw.extend(data);stream.feed(data)
    def text():return '\n'.join(screen.display)
    def key(k,seconds=.25):os.write(master,k);pump(seconds)
    def capture(label):
        (out/f'{name}-{label}.txt').write_text(text())
        lines=[]
        for y in range(screen.lines):
            parts=[]
            for x in range(screen.columns):
                c=screen.buffer[y][x];fg='#'+c.fg if len(c.fg)==6 else '#c0c0c0';bg='#'+c.bg if len(c.bg)==6 else '#000000'
                parts.append(f'<span style="color:{fg};background:{bg}">{html.escape(c.data)}</span>')
            lines.append(''.join(parts))
        (out/f'{name}-{label}.html').write_text('<!doctype html><style>@font-face{font-family:Departure;src:url(http://127.0.0.1:4321/fonts/DepartureMono-Regular.woff2)}body{margin:0;background:#000}pre{font-family:Departure,monospace;font-size:14px;line-height:22px;margin:16px;white-space:pre}</style><pre>'+ '\n'.join(lines)+'</pre>')
    try:
        pump(7 if gpu else 2.5)
        assert 'Austin Delic.' in text(),text()
        if gpu:assert 'GPU' in text(),text()
        if name=='fallback':assert 'Static fallback' in text(),text()
        capture('home')
        key(b'\x1b[C\r');assert 'Blog posts' in text(),text();capture('blog')
        key(b'\t'*5+b'\r');assert '2026-' in text(),text();capture('post')
        key(b'\x1b[F');key(b'\x1b[H');key(b'\x1b');assert 'Blog posts' in text(),text()
        key(b'\x1b[C'*3+b'\r');assert 'SOCIAL LINKS' in text(),text();capture('socials')
        key(b'\x1b[C'*4+b'\r',1);assert 'EXPLORE' in text(),text();capture('explore')
        if gpu:
            assert 'Render 1x' in text(),text()
            key(b' ')
            for k,label in [(b'9','0.5'),(b'9','0.5'),(b'8','1'),(b'8','2'),(b'8','4'),(b'8','4')]:
                key(k,.6);assert f'Render {label}x' in text(),text()
                assert '[paused]' in text(),text()
            key(b'\x1b');key(b'\r',.6)
            assert 'Render 4x' in text(),text()
            for w,h in [(60,18),(120,40)]:
                screen.resize(h,w);fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',h,w,0,0));os.kill(proc.pid,signal.SIGWINCH);pump(.6)
                assert '9/8 decrease/increase' in text(),text()
                assert f'{w*8}x{h*16} px' in text(),text()
            key(b'0',.6);assert 'Render 1x' in text(),text()
        key(b'wijdqerf[]-=,. ',.4);key(b'?',.2);assert 'Ctrl-C' in text();key(b'\x1b',.2);key(b'\x1b',.2)
        for w,h in [(60,18),(30,10),(80,24),(160,50),(120,40)]:
            screen.resize(h,w);fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',h,w,0,0));os.kill(proc.pid,signal.SIGWINCH);pump(.25)
            if w==30:assert 'Resize terminal' in text(),text()
        if exit_key is None:os.kill(proc.pid,signal.SIGTERM);pump(.4)
        else:key(exit_key,.4)
        proc.wait(timeout=5);assert proc.returncode==0,(proc.returncode,text())
        assert json.loads((out/f'{name}-cleanup.json').read_text())['restored'],'Terminal attributes not restored'
        assert b'\x1b[?1049l' in raw and b'\x1b[?25h' in raw,'Missing alternate screen/cursor restoration'
        print(name, 'PASS', (out/f'{name}-metrics.json').read_text())
    finally:
        if proc.poll() is None:proc.kill();proc.wait()
        (out/f'{name}.ansi').write_bytes(raw);os.close(master);os.close(slave)
run_case('static',['--renderer','static','--ascii'])
run_case('ctrl-c',['--renderer','static'],b'\x03')
run_case('sigterm',['--renderer','static'],None)
if '--gpu' in sys.argv:run_case('gpu',['--renderer','gpu'],gpu=True)

if '--fallback' in sys.argv:run_case('fallback',['--renderer','auto'])
