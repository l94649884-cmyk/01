"""Exercise the real packaged solver and actual Edge WebView using an isolated profile."""
import json
import math
import time
from http.client import HTTPConnection
from urllib.parse import urlsplit


def wait_for(window, expression, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = window.evaluate_js(expression)
        if value:
            return value
        time.sleep(.1)
    raise AssertionError(f'UI condition timed out: {expression}')


def run_checks(window, url, root):
    assert window.events.loaded.wait(30), 'WebView did not load'
    wait_for(window, 'document.querySelector("[data-testid=max-moment]")?.textContent.match(/\\d/) != null')
    prior = window.evaluate_js('localStorage.getItem("ligou-desktop-smoke")')
    stored_before = window.evaluate_js('JSON.parse(localStorage.getItem("ligou-lab-workspace-v1")).history.present.name')
    cases = [
        ('01-simply-supported-point.json', [5, 5], 15),
        ('02-simply-supported-udl.json', [6, 6], 9),
        ('03-cantilever-point.json', [10], -30),
    ]
    if prior:
        expected = json.loads((root / 'examples' / cases[-1][0]).read_text(encoding='utf8'))['name']
        assert stored_before == expected, 'Draft did not persist across application restarts'
    results = []
    for filename, reactions, moment in cases:
        payload = (root / 'examples' / filename).read_text(encoding='utf8')
        endpoint = urlsplit(url)
        connection = HTTPConnection(endpoint.hostname, endpoint.port, timeout=10)
        try:
            connection.request('POST', '/api/solve', payload.encode(), {'Content-Type': 'application/json'})
            response = connection.getresponse()
            assert response.status == 200, response.read().decode()
            result = json.load(response)
        finally:
            connection.close()
        actual = [r['vertical'] for r in result['reactions']]
        assert len(actual) == len(reactions)
        assert all(math.isclose(a, b, abs_tol=1e-8) for a, b in zip(actual, reactions)), actual
        assert math.isclose(result['extrema']['moment']['moment'], moment, abs_tol=1e-8)
        # Feed the real file-input event, so this also exercises JSON import in the shipped UI.
        window.evaluate_js('''(() => {
            const input = document.querySelector('input[type=file]');
            const transfer = new DataTransfer();
            transfer.items.add(new File([%s], 'desktop-test.json', {type:'application/json'}));
            input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
            return true;
        })()''' % json.dumps(payload))
        name = json.loads(payload)['name']
        wait_for(window, 'document.querySelector("[aria-label=模型名称]")?.value === ' + json.dumps(name))
        wait_for(window, f'document.querySelector("[data-testid=max-moment]")?.textContent.includes("{abs(moment)}")')
        results.append({'example': filename, 'reactions': actual, 'moment': result['extrema']['moment']['moment'], 'ui_import_and_result': True})
    # Verify the new controls in the shipped native UI, rather than only testing a dev server.
    controls = window.evaluate_js('Array.from(document.querySelectorAll("button"), b => b.textContent.trim())')
    assert all(label in controls for label in ['连续直角折杆', '拱形建模']), controls
    window.evaluate_js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "查看梁截面参数").click()')
    wait_for(window, 'document.querySelector("[data-testid=coordinates]")?.textContent.includes("绝对 X")')
    window.evaluate_js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "拱形建模").click()')
    wait_for(window, 'document.querySelector("[aria-label=拱跨度]") != null')
    window.evaluate_js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "生成拱形模型").click()')
    wait_for(window, 'document.querySelector(".model-count")?.textContent.includes("33 节点 / 32 杆件")')
    wait_for(window, 'document.querySelector(".validation-bar")?.textContent.includes("平衡校验通过")')
    # Restore the final benchmark so the next run checks the same persisted model.
    window.evaluate_js("""(() => {
        const input = document.querySelector('input[type=file]'), transfer = new DataTransfer();
        transfer.items.add(new File([%s], 'restore.json', {type:'application/json'}));
        input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    })()""" % json.dumps(payload))
    wait_for(window, 'document.querySelector("[aria-label=模型名称]")?.value === ' + json.dumps(name))
    wait_for(window, 'document.querySelector("[data-testid=max-moment]")?.textContent.includes("30")')
    assert window.evaluate_js('document.querySelectorAll(".konvajs-content canvas").length > 0')
    window.evaluate_js('localStorage.setItem("ligou-desktop-smoke", "passed")')
    return {'passed': True, 'native_webview': True, 'construction_controls': True, 'coordinates_panel': True, 'arch_ui_solved': True, 'canvas_rendered': True, 'benchmarks': results,
            'previous_run_marker': prior, 'draft_restored_after_restart': bool(prior), 'stored_model_before_test': stored_before}
