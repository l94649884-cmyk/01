"""Build a self-contained Windows folder without requiring Python or Node on the target PC."""
from pathlib import Path
import importlib.metadata as metadata
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / 'desktop'

def main():
    icon = Image.new('RGBA', (256, 256))
    d = ImageDraw.Draw(icon)
    d.rounded_rectangle((8, 8, 248, 248), radius=55, fill='#16756d')
    d.line([(55, 193), (126, 56), (201, 193), (55, 193)], fill='white', width=12, joint='curve')
    d.line([(89, 156), (165, 156)], fill='white', width=12)
    icon.save(DESKTOP / 'icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
    assert (ROOT / 'frontend/dist/index.html').is_file(), 'Build the frontend first'
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
               '--name', 'LigouLab', '--icon', str(DESKTOP / 'icon.ico'),
               '--distpath', str(DESKTOP / 'dist'), '--workpath', str(DESKTOP / 'build'), '--specpath', str(DESKTOP),
               '--paths', str(ROOT / 'backend'), '--paths', str(DESKTOP),
               '--add-data', f'{ROOT / "frontend/dist"};frontend/dist',
               '--add-data', f'{ROOT / "examples"};examples',
               '--add-data', f'{DESKTOP / "icon.ico"};desktop',
               '--collect-all', 'webview', '--collect-all', 'clr_loader',
               '--collect-submodules', 'uvicorn', '--hidden-import', 'smoke_test',
               '--exclude-module', 'pytest', '--exclude-module', 'PyQt5', '--exclude-module', 'PyQt6',
               '--exclude-module', 'PySide2', '--exclude-module', 'PySide6', str(DESKTOP / 'launcher.py')]
    subprocess.run(command, cwd=ROOT, check=True)
    output = DESKTOP / 'dist/LigouLab'
    shutil.copy2(ROOT / 'LICENSE', output / 'LICENSE')
    shutil.copy2(DESKTOP / '使用说明.txt', output / '使用说明.txt')
    notices = output / '第三方许可'
    notices.mkdir(exist_ok=True)
    # Preserve dependency notices; build-only packages are included as a conservative superset.
    for package in metadata.distributions():
        for file in package.files or []:
            if '.dist-info/' in str(file) and any(word in file.name.lower() for word in ['license', 'copying', 'notice']):
                source = Path(package.locate_file(file))
                if source.is_file():
                    target = notices / package.metadata['Name'] / str(file).split('.dist-info/', 1)[1]
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
    print(f'Desktop build ready: {output}', flush=True)

if __name__ == '__main__':
    main()
