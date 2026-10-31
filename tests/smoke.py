"""Headless-browser smoke test.

Serves the repo root, loads index.html in Chrome, and checks that the game boots
without console errors, renders frames, responds to the icon buttons, and that
nothing on the page is text-selectable.

Usage: python3 tests/smoke.py [screenshot_dir]
Needs: pip install playwright, and a Chrome/Chromium binary (CHROME env var or google-chrome).
"""
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else None


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', 0), Quiet)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


failures = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def main():
    srv = serve()
    url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    chrome = os.environ.get('CHROME', '/usr/bin/google-chrome')
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=chrome,
            headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
                  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        )
        # landscape phone
        page = browser.new_page(viewport={'width': 844, 'height': 390})
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(url)
        page.wait_for_function('window.__voxelRacers && window.__voxelRacers.ready', timeout=20000)
        check(True, 'game boots')

        page.wait_for_function('window.__voxelRacers.frames > 5', timeout=20000)
        check(True, 'renders frames')

        voxels = page.evaluate('window.__voxelRacers.voxels')
        check(voxels > 1500, f'truck has detail ({voxels} voxels)')

        check(page.evaluate('window.__voxelRacers.trucks') == 6, 'six trucks in roster')
        check(page.evaluate('window.__voxelRacers.scenery.cacti') > 0, 'scenery generated')

        # splash is dismissed and garage appears
        page.evaluate('window.__voxelRacers.endSplash()')
        page.wait_for_selector('#garage:not([hidden])', timeout=5000)
        page.wait_for_timeout(900)
        check(page.locator('#splash').count() == 0, 'splash removed after fade')

        # icon buttons switch trucks and persist
        first = page.evaluate('window.__voxelRacers.truckId')
        page.click('#btn-next')
        second = page.evaluate('window.__voxelRacers.truckId')
        check(first != second, f'next button changes truck ({first} -> {second})')
        page.click('#btn-prev')
        check(page.evaluate('window.__voxelRacers.truckId') == first, 'prev button returns')
        page.click('#btn-next')
        page.click('#btn-paint')
        saved = page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save'))")
        check(saved['truckId'] == second and second in saved['paints'], 'truck + paint saved to localStorage')

        # nothing is selectable, buttons carry no text
        sel = page.evaluate("getComputedStyle(document.body).userSelect")
        check(sel == 'none', f'body user-select is none ({sel})')
        btn_text = page.evaluate("[...document.querySelectorAll('.icon-btn')].map(b => b.textContent.trim()).join('')")
        check(btn_text == '', 'icon buttons contain no text')

        # canvas is not blank
        page.wait_for_timeout(300)
        png = page.screenshot()
        if SHOT_DIR:
            SHOT_DIR.mkdir(parents=True, exist_ok=True)
            (SHOT_DIR / 'garage.png').write_bytes(png)
        from io import BytesIO
        from PIL import Image
        img = Image.open(BytesIO(png)).convert('RGB').resize((64, 32))
        distinct = len({(r >> 4, g >> 4, b >> 4) for r, g, b in img.getdata()})
        check(distinct > 6, f'screen has varied pixels ({distinct} colours)')

        # portrait should also boot cleanly
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(300)
        check(page.evaluate('window.__voxelRacers.frames') > 10, 'still rendering in portrait')

        check(not errors, 'no console errors' + (f': {errors[:3]}' if errors else ''))
        browser.close()
    srv.shutdown()
    if failures:
        print(f'\n{len(failures)} check(s) failed')
        sys.exit(1)
    print('\nAll smoke checks passed')


if __name__ == '__main__':
    main()
