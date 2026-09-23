"""Generate the one-page resume. Requires Typst 0.15.1 on PATH."""

from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / "public" / "resume.pdf"


def generate():
    # Compile in temporary storage; the template rejects multi-page layouts.
    # A failed compile therefore leaves the existing public PDF untouched.
    with TemporaryDirectory(prefix="resume-") as directory:
        result = Path(directory) / "resume.pdf"
        subprocess.run([
            "typst", "compile", "--ignore-system-fonts",
            "--creation-timestamp", "0",
            str(ROOT / "resume.typ"), str(result),
        ], check=True)
        OUTPUT.write_bytes(result.read_bytes())
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    generate()
