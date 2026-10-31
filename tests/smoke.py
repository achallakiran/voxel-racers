"""Headless-browser smoke test.

Serves the repo root, loads index.html in Chrome and walks the whole start-up flow:
rotate prompt (portrait) -> tap to start -> ADA Studios intro -> title -> garage.
Then cycles all trucks checking for console errors, animated parts, smoke, icon-only
controls and non-selectable text.

Usage: python3 tests/smoke.py [screenshot_dir]
Needs: pip install playwright pillow, and a Chrome/Chromium binary (CHROME env var or google-chrome).
"""
import http.server
import os
import socketserver
import sys
import threading
from io import BytesIO
from pathlib import Path

from PIL import Image
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


def colours(png, size=(64, 32)):
    img = Image.open(BytesIO(png)).convert('RGB').resize(size)
    return len({(r >> 4, g >> 4, b >> 4) for r, g, b in img.getdata()})


def shot(page, name):
    png = page.screenshot()
    if SHOT_DIR:
        SHOT_DIR.mkdir(parents=True, exist_ok=True)
        (SHOT_DIR / f'{name}.png').write_bytes(png)
    return png


def visible(page, sel):
    return page.evaluate(
        """(s) => { const e = document.querySelector(s); if (!e) return false;
           const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5; }""",
        sel,
    )


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
        page = browser.new_page(viewport={'width': 844, 'height': 390})  # landscape phone
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        # ---------------- boot in portrait: rotate prompt, intro waits
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(url)
        page.wait_for_function('window.__voxelRacers && window.__voxelRacers.ready', timeout=20000)
        page.wait_for_timeout(300)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'boot', 'intro waits while the phone is in portrait')
        check(visible(page, '#rotate'), 'portrait shows the rotate-phone prompt')
        check(page.evaluate("getComputedStyle(document.querySelector('.phone')).animationName") == 'tilt', 'phone tilt animation running')
        shot(page, '01-rotate-portrait')

        # ---------------- turn to landscape: intro starts by itself (no tap)
        page.set_viewport_size({'width': 844, 'height': 390})
        page.wait_for_function("window.__voxelRacers.flow.state === 'intro'", timeout=5000)
        check(True, 'turning landscape starts the intro automatically')
        check(not visible(page, '#rotate'), 'rotate prompt gone after turning landscape')
        check(page.evaluate("document.getElementById('start')") is None, 'there is no tap-to-start screen')
        page.wait_for_function('window.__voxelRacers.frames > 5', timeout=20000)
        check(True, 'game loop running during the intro')

        def op(sel):
            return page.evaluate("(s) => parseFloat(getComputedStyle(document.querySelector(s)).opacity)", sel)

        # logo shows first (studio text not yet visible)
        page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('#intro .emblem')).opacity) > 0.9", timeout=4000)
        check(op('#intro .studio') < 0.1, 'logo is shown first, studio text not yet')
        shot(page, '02a-intro-logo')
        # logo fades away
        page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('#intro .emblem')).opacity) < 0.05", timeout=5000)
        check(True, 'logo fades out')
        # then ADA STUDIOS PRESENTS appears and shows in full
        page.wait_for_function(
            "['.line1', '.line2'].every(s => { const e = document.querySelector('#intro ' + s); return e.clientWidth > 0 && e.clientWidth >= e.scrollWidth - 1; })",
            timeout=6000)
        check(op('#intro .studio') > 0.8 and op('#intro .emblem') < 0.05, 'studio text shows after the logo has faded')
        studio = page.evaluate("document.querySelector('#intro .line1').textContent + ' ' + document.querySelector('#intro .line2').textContent")
        check(studio == 'ADA STUDIOS PRESENTS', f'intro text reads "{studio}"')
        shot(page, '02b-intro-studio')
        page.wait_for_function("window.__voxelRacers.flow.state === 'title'", timeout=9000)
        check(True, 'intro auto-advances to title')

        # ---------------- title
        page.wait_for_function(
            "(() => { const e = document.querySelector('#title'); return e.classList.contains('on') && parseFloat(getComputedStyle(e).opacity) > 0.9; })()",
            timeout=8000)
        check(visible(page, '#title'), 'title screen visible')
        logo = page.evaluate("document.querySelector('#title .logo').textContent")
        check('VOXEL' in logo and 'MONSTERS' in logo, 'title logo says Voxel Monsters')
        check(page.title() == 'Voxel Monsters', 'page title is Voxel Monsters')
        page.wait_for_timeout(1200)
        check(page.evaluate('window.__voxelRacers.worldMode') == 'outdoor', 'title uses the sunset stadium')
        ws = page.evaluate('window.__voxelRacers.world')
        check(ws['tires'] == 144 and ws['crowd'] > 250 and ws['towers'] == 4, f'stadium built ({ws})')
        shot(page, '03-title')

        # skipping the intro by tap also works (reload path)
        page2 = browser.new_page(viewport={'width': 844, 'height': 390})
        page2.goto(url)
        page2.wait_for_function("window.__voxelRacers && window.__voxelRacers.flow.state === 'intro'")
        page2.mouse.click(400, 200)
        check(page2.evaluate('window.__voxelRacers.flow.state') == 'title', 'tapping the intro skips it')
        page2.close()

        # ---------------- title -> garage
        page.click('#btn-play', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'play opens the garage')
        page.wait_for_timeout(900)
        check(visible(page, '#controls'), 'garage controls visible')
        page.wait_for_function('window.__voxelRacers.drawn > 5', timeout=20000)
        check(True, 'garage renders the 3D scene')
        check(page.evaluate('window.__voxelRacers.worldMode') == 'garage', 'garage has its own environment')

        # ---------------- cycle all trucks
        n = page.evaluate('window.__voxelRacers.trucks')
        check(n == 8, f'eight trucks in roster ({n})')
        first = page.evaluate('window.__voxelRacers.truckId')
        seen = {}
        for i in range(n):
            tid = page.evaluate('window.__voxelRacers.truckId')
            page.wait_for_timeout(1400)
            info = page.evaluate(
                "({v: window.__voxelRacers.voxels, parts: window.__voxelRacers.parts, em: window.__voxelRacers.emitters, w: window.__voxelRacers.wheels})")
            png = shot(page, f'truck-{i + 1}-{tid}')
            seen[tid] = info
            check(info['v'] > 2000, f"{tid}: detailed ({info['v']} voxels)")
            check(info['parts'] or info['em'], f"{tid}: has motion/smoke (parts={info['parts']}, emitters={info['em']})")
            check(colours(png) > 12, f'{tid}: renders')
            page.click('#btn-next')
        check(page.evaluate('window.__voxelRacers.truckId') == first, 'next x8 wraps back to the first truck')
        check(seen['titan']['w'] == 6, 'Titan has six wheels')
        check(seen['yellow-thunder']['w'] == 4 and 'stopsign' in seen['yellow-thunder']['parts'], 'bus has a swinging stop sign')
        check('jaw' in seen['toxic']['parts'], 'Toxic has a moving jaw')
        check(any(x.startswith('piston') for x in seen['magma']['parts']) and 'pulley' in seen['magma']['parts'], 'Magma has pistons and crank pulley')
        check('crane' in seen['night-rider']['parts'] and 'hook' in seen['night-rider']['parts'], 'Night Rider has crane and hook')

        # ---------------- smoke particles really appear when revving
        page.mouse.move(420, 120)
        page.mouse.down()
        page.wait_for_timeout(1800)
        alive = page.evaluate('window.__voxelRacers.particlesAlive')
        page.mouse.up()
        check(alive > 10, f'revving produces particles ({alive} alive)')
        check(page.evaluate('window.__voxelRacers.rev') > 0.5, 'holding the screen revs the engine')

        # ---------------- paint + persistence
        page.click('#btn-paint')
        saved = page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save'))")
        cur = page.evaluate('window.__voxelRacers.truckId')
        check(saved['truckId'] == cur and cur in saved['paints'], 'truck + paint saved to localStorage')

        # ---------------- back to title
        page.click('#btn-back')
        check(page.evaluate('window.__voxelRacers.flow.state') == 'title', 'home icon returns to title')
        check(page.evaluate('window.__voxelRacers.worldMode') == 'outdoor', 'home returns to the stadium')

        # ---------------- icon-only and unselectable
        sel = page.evaluate('getComputedStyle(document.body).userSelect')
        check(sel == 'none', f'body user-select is none ({sel})')
        btn_text = page.evaluate("[...document.querySelectorAll('.icon-btn')].map(b => b.textContent.trim()).join('')")
        check(btn_text == '', 'icon buttons contain no text')

        # portrait still boots cleanly in the garage
        page.click('#btn-play', force=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(400)
        check(page.evaluate('window.__voxelRacers.frames') > 20, 'still rendering after rotating')

        check(not errors, 'no console errors' + (f': {errors[:3]}' if errors else ''))
        browser.close()
    srv.shutdown()
    if failures:
        print(f'\n{len(failures)} check(s) failed')
        sys.exit(1)
    print('\nAll smoke checks passed')


if __name__ == '__main__':
    main()
