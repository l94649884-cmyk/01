"""Windows desktop shell; the web UI and mechanics solver are unchanged."""
from pathlib import Path
import argparse
import hashlib
import ctypes
from ctypes import wintypes
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import socket
import sys
import threading
import time
import traceback

TITLE = '力构 Lab'
PORT = 18764  # Stable origin preserves the browser's draft/history between launches.
ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(ROOT / 'backend'))


def acquire_instance(name):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.CreateMutexW(None, False, name)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        kernel.CloseHandle(handle)
        user = ctypes.windll.user32
        user.FindWindowW.restype = wintypes.HWND
        user.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
        user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        user.SetForegroundWindow.argtypes = [wintypes.HWND]
        window = user.FindWindowW(None, TITLE)
        if window:
            user.ShowWindow(window, 9)
            user.SetForegroundWindow(window)
        return None, kernel
    return handle, kernel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', type=Path, help='Write a packaged-app smoke report using an isolated profile.')
    args = parser.parse_args()
    report = args.self_test.resolve() if args.self_test else None
    data = report.parent / 'profile' if report else Path(os.environ['LOCALAPPDATA']) / 'LigouLab'
    data.mkdir(parents=True, exist_ok=True)
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w', encoding='utf8')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w', encoding='utf8')
    logging.basicConfig(level=logging.INFO, handlers=[RotatingFileHandler(data / 'desktop.log', maxBytes=2_000_000, backupCount=2, encoding='utf8')])
    mutex = kernel = server = thread = listener = None
    outcome = {}
    try:
        mutex, kernel = acquire_instance(r'Local\LigouLab.Desktop.Smoke' if report else r'Local\LigouLab.Desktop')
        if mutex is None:
            return 0
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('LigouLab.Desktop')
        import uvicorn
        import webview
        from fastapi.staticfiles import StaticFiles
        from app.main import app

        if not any(route.name == 'frontend' for route in app.routes):
            app.mount('/', StaticFiles(directory=ROOT / 'frontend/dist', html=True), name='frontend')
        port = PORT + 1 if report else PORT
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            listener.bind(('127.0.0.1', port))
        except OSError as exc:
            raise RuntimeError(f'本地端口 {port} 已被其他程序占用，请关闭占用程序后重试。') from exc
        listener.listen(128)
        listener.setblocking(False)
        config = uvicorn.Config(app, host='127.0.0.1', port=port, log_config=None, access_log=False, loop='asyncio', http='h11', ws='none')
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
        thread.start()
        deadline = time.monotonic() + 20
        while not server.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError('计算服务启动失败，请查看 desktop.log。')
            time.sleep(.05)
        webview.settings['ALLOW_DOWNLOADS'] = True
        url = f'http://127.0.0.1:{port}'
        # A changed frontend must not reuse a stale cached entry page.
        build_id = hashlib.sha256((ROOT / 'frontend/dist/index.html').read_bytes()).hexdigest()[:16]
        window = webview.create_window(TITLE, url + '?build=' + build_id, width=1440, height=960, min_size=(1000, 700), background_color='#f5f7fa', hidden=bool(report))
        window.events.closed += lambda: setattr(server, 'should_exit', True)

        def smoke():
            from smoke_test import run_checks
            try:
                outcome.update(run_checks(window, url, ROOT))
            except Exception:
                outcome.update(passed=False, error=traceback.format_exc())
                logging.exception('Desktop smoke test failed')
            finally:
                report.write_text(json.dumps(outcome, ensure_ascii=False, indent=2), encoding='utf8')
                window.destroy()

        webview.start(smoke if report else None, gui='edgechromium', private_mode=False, storage_path=str(data / 'WebView'), icon=str(ROOT / 'desktop/icon.ico'))
        return 0 if not report or outcome.get('passed') else 1
    except Exception:
        error = traceback.format_exc()
        logging.exception('Desktop startup failed')
        if report:
            report.write_text(json.dumps({'passed': False, 'error': error}, ensure_ascii=False, indent=2), encoding='utf8')
        else:
            ctypes.windll.user32.MessageBoxW(None, f'无法启动力构 Lab。\n\n{error.splitlines()[-1]}\n\n日志：{data / "desktop.log"}', TITLE, 0x10)
        return 1
    finally:
        if server:
            server.should_exit = True
        if thread:
            thread.join(timeout=5)
        if listener:
            listener.close()
        if mutex:
            kernel.CloseHandle(mutex)


if __name__ == '__main__':
    raise SystemExit(main())
