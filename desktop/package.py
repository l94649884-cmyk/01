"""Create a portable ZIP and SHA-256 checksum from the validated desktop build."""
from pathlib import Path
import hashlib
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    build = ROOT / 'desktop/dist/LigouLab'
    if not (build / 'LigouLab.exe').is_file():
        raise SystemExit('Run desktop/build.py first.')
    output = ROOT / 'desktop/releases'
    output.mkdir(exist_ok=True)
    archive = Path(shutil.make_archive(str(output / 'LigouLab-Windows-x64'), 'zip', build.parent, build.name))
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError('ZIP integrity check failed.')
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='ascii')
    print(f'{archive}\nSHA256: {digest}\nSize: {archive.stat().st_size / 1024**2:.1f} MiB')


if __name__ == '__main__':
    main()
