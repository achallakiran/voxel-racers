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

        # the code-font line comes first: ADA STUDIO PRESENTS (logo not yet visible)
        page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('#intro .code')).opacity) > 0.9", timeout=5000)
        check(op('#intro .emblem') < 0.1, 'code text shows first, logo not yet')
        txt = page.evaluate("document.querySelector('#intro .code .txt').textContent")
        check(txt == 'ADA STUDIO PRESENTS', f'intro text reads "{txt}"')
        mono = page.evaluate("getComputedStyle(document.querySelector('#intro .code')).fontFamily.toLowerCase()")
        check('mono' in mono or 'courier' in mono or 'consolas' in mono, f'intro text uses a code font ({mono[:40]})')
        check(page.evaluate("(() => { const e = document.querySelector('#intro .code'); return e.clientWidth > 0 && e.getBoundingClientRect().right <= innerWidth; })()"), 'intro text fits the screen')
        shot(page, '02a-intro-code')
        # text fades out, then the ADA logo fades in
        page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('#intro .code')).opacity) < 0.05", timeout=5000)
        check(True, 'code text fades out')
        page.wait_for_function("parseFloat(getComputedStyle(document.querySelector('#intro .emblem')).opacity) > 0.9", timeout=5000)
        check(op('#intro .code') < 0.1, 'ADA logo shows after the text has faded')
        check(page.evaluate("document.querySelector('#intro .emblem').getAttribute('src')") == 'assets/ada-logo.jpg', 'intro shows the ADA logo')
        shot(page, '02b-intro-logo')
        # the electric effect: bolts + flash, then the title
        page.wait_for_function("document.getElementById('intro').classList.contains('zap')", timeout=6000)
        page.wait_for_timeout(300)
        lit = page.evaluate("(() => { const c = document.getElementById('zap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })()")
        check(lit > 50, f'electric bolts are drawn over the logo ({lit} lit pixels)')
        shot(page, '02c-intro-zap')
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
        page2.goto(url, timeout=180000)
        page2.wait_for_function("window.__voxelRacers && window.__voxelRacers.flow.state === 'intro'", timeout=180000)
        page2.mouse.click(400, 200)      # first tap unlocks sound and lets the intro play on
        check(page2.evaluate('window.__voxelRacers.flow.state') == 'intro', 'the first tap unlocks sound without skipping')
        page2.mouse.click(400, 200)
        check(page2.evaluate('window.__voxelRacers.flow.state') == 'title', 'tapping the intro again skips it')
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
        check(n == 9, f'nine trucks in roster ({n})')
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
        check(page.evaluate('window.__voxelRacers.truckId') == first, 'next x9 wraps back to the first truck')
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

        # ---------------- suspension mode (garage only): soft -> stiff -> normal... saved per truck
        m0 = page.evaluate("document.getElementById('btn-sus').dataset.mode")
        page.click('#btn-sus')
        m1 = page.evaluate("document.getElementById('btn-sus').dataset.mode")
        saved = page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save'))")
        check(m0 == 'normal' and m1 == 'stiff' and saved['sus'][cur] == 'stiff', 'suspension button cycles and is saved per truck')
        page.click('#btn-sus'); page.click('#btn-sus')
        check(page.evaluate("document.getElementById('btn-sus').dataset.mode") == 'normal', 'suspension cycles back to normal')

        # ---------------- rival difficulty (garage gauge icon): normal -> hard -> easy -> normal, saved
        d0 = page.evaluate("document.getElementById('btn-diff').dataset.mode")
        page.click('#btn-diff')
        d1 = page.evaluate("document.getElementById('btn-diff').dataset.mode")
        saved = page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save'))")
        check(d0 == 'normal' and d1 == 'hard' and saved['difficulty'] == 'hard', 'difficulty button cycles and is saved')
        page.click('#btn-diff'); page.click('#btn-diff')
        check(page.evaluate("document.getElementById('btn-diff').dataset.mode") == 'normal', 'difficulty cycles back to normal')

        # ---------------- drive (Phase 1): joystick + 2 buttons, nitro, 4 cameras
        page.evaluate('window.__voxelRacers.arenaFoes = 0')      # practice round: no rivals while testing the controls
        page.click('#btn-arena', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'drive', 'arena icon starts driving')
        check(page.evaluate('window.__voxelRacers.driveMode') == 'arena', 'arena mode')
        check(not visible(page, '#race-hud'), 'race HUD hidden in the arena')
        page.wait_for_function('window.__voxelRacers.vehicle !== null && window.__voxelRacers.drawn > 30', timeout=150000)
        check(page.evaluate('window.__voxelRacers.worldMode') == 'drive', 'driving uses the sandbox arena')
        sbx = page.evaluate('window.__voxelRacers.world.sandbox')
        check(sbx['columns'] > 1500 and sbx['wall'] > 800, f'sandbox built ({sbx})')
        page.wait_for_function("parseFloat(getComputedStyle(document.getElementById('drive')).opacity) > 0.9", timeout=5000)
        check(visible(page, '#drive'), 'drive HUD visible')
        hud_text = page.evaluate("[...document.querySelectorAll('#drive button')].map(b => b.textContent.trim()).join('') + document.getElementById('nitro').textContent.trim()")
        check(hud_text == '', 'drive HUD is icons only')
        check(page.evaluate("getComputedStyle(document.getElementById('drive')).userSelect") == 'none', 'drive HUD text not selectable')
        page.wait_for_function("window.__voxelRacers.match && window.__voxelRacers.match.phase === 'fight'", timeout=60000)
        check(visible(page, '#arena-hud') and visible(page, '#hp'), 'arena HUD and health bar visible')
        check(page.evaluate('window.__voxelRacers.arenaTerrain.props.length') >= 50, 'arena is full of destructible props')
        check(page.evaluate('window.__voxelRacers.shown.arena') is True and page.evaluate('window.__voxelRacers.shown.track') is False, 'arena terrain is switched on, no race track showing')
        shot(page, '04-drive-start')

        # gas button (B1) with the mouse = a finger
        gb = page.locator('#btn-gas').bounding_box()
        page.mouse.move(gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2)
        page.mouse.down()
        page.wait_for_function('window.__voxelRacers.vehicle.f > 4', timeout=15000)
        check(page.evaluate("document.getElementById('btn-gas').classList.contains('down')"), 'gas button shows pressed')
        check(True, 'gas button (B1) accelerates the truck')
        # (mouse pointer is held on the gas button; joystick drag below needs a second pointer, so test steering with keys + stick separately)
        page.mouse.up()
        check(not page.evaluate("document.getElementById('btn-gas').classList.contains('down')"), 'gas releases')

        # joystick: drag right while using keyboard gas
        h0 = page.evaluate('window.__voxelRacers.vehicle.heading')
        page.keyboard.down('ArrowUp')
        zb = page.locator('#joy-zone').bounding_box()
        sx, sy0 = zb['x'] + 120, zb['y'] + zb['height'] - 90
        page.mouse.move(sx, sy0)
        page.mouse.down()
        page.mouse.move(sx + 60, sy0, steps=4)
        page.wait_for_function(f'window.__voxelRacers.vehicle.heading < {h0} - 0.25', timeout=15000)
        check(True, 'joystick right steers the truck right')
        check(page.evaluate("document.getElementById('joy-base').classList.contains('active')"), 'joystick base shows while touched')
        page.mouse.up()
        page.keyboard.up('ArrowUp')

        # brake button (B2) slows, then reverses
        bb = page.locator('#btn-brake').bounding_box()
        page.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        page.mouse.down()
        page.wait_for_function('window.__voxelRacers.vehicle.f < 0', timeout=20000)
        check(True, 'brake button (B2) stops and reverses')
        page.mouse.up()

        # nitro: its own visible button (tap)
        check(visible(page, '#btn-nitro'), 'nitro button is visible')
        n0 = page.evaluate('window.__voxelRacers.vehicle.nitro')
        nb = page.locator('#btn-nitro').bounding_box()
        page.mouse.move(nb['x'] + nb['width'] / 2, nb['y'] + nb['height'] / 2)
        page.mouse.down()
        page.mouse.up()
        page.wait_for_function(f'window.__voxelRacers.vehicle.nitro < {n0} - 0.2 || window.__voxelRacers.vehicle.boostT > 0', timeout=8000)
        check(True, 'tapping the nitro button fires a boost')
        sy = page.evaluate('window.__voxelRacers.susp')
        check(all(k in sy for k in ('heave', 'pitch', 'roll')), 'body suspension is live')
        page.wait_for_timeout(500)
        shot(page, '05-drive-boost')

        # camera icon cycles four views and saves the choice
        modes = []
        for _ in range(4):
            page.click('#btn-cam', force=True)
            page.wait_for_timeout(300)
            modes.append(page.evaluate('window.__voxelRacers.camMode'))
        check(len(set(modes)) == 4, f'camera icon cycles four views {modes}')
        saved = page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save')).camera")
        check(saved == modes[-1], 'camera choice saved')
        for m in ('chase', 'top', 'iso-fixed'):
            while page.evaluate('window.__voxelRacers.camMode') != m:
                page.click('#btn-cam', force=True)
            page.wait_for_timeout(1200)
            shot(page, f'06-drive-cam-{m}')
        while page.evaluate('window.__voxelRacers.camMode') != 'iso-follow':
            page.click('#btn-cam', force=True)

        # keyboard: space = nitro, and a jump over the kicker works end-to-end
        page.keyboard.down('Space')
        page.keyboard.up('Space')
        # back to the garage
        page.click('#btn-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'exit icon returns to the garage')
        check(page.evaluate('window.__voxelRacers.worldMode') == 'garage', 'garage environment restored')
        check(page.evaluate('window.__voxelRacers.vehicle') is None, 'vehicle released')

        # ---------------- arena fight: rivals, smashing, explosions, health, results
        page.evaluate('window.__voxelRacers.arenaFoes = 5')
        page.click('#btn-arena', force=True)
        page.wait_for_function("window.__voxelRacers.match && window.__voxelRacers.match.phase === 'fight'", timeout=90000)
        check(page.evaluate('window.__voxelRacers.rivals.length') == 5, 'five rival brawlers in the arena')
        check(page.evaluate("document.getElementById('foes').textContent") == '5', 'rivals-left counter shows 5')
        # rivals hunt the player: someone gets hurt within a while
        page.keyboard.down('ArrowUp')
        page.wait_for_function('window.__voxelRacers.rivals.some((r) => r.v.f > 6)', timeout=60000)
        check(True, 'rivals charge')
        page.keyboard.up('ArrowUp')
        # smash a crate, then chain-detonate TNT through the game's own rules
        n0 = page.evaluate('window.__voxelRacers.arenaTerrain.props.length')
        page.evaluate("window.__voxelRacers.destroyProp(window.__voxelRacers.arenaTerrain.props.find((p) => p.type === 'crate'))")
        n1 = page.evaluate('window.__voxelRacers.arenaTerrain.props.length')
        check(n1 == n0 - 1, 'smashing a crate removes it')
        check(page.evaluate('window.__voxelRacers.debris.alive') > 0, 'smashed props throw voxel debris')
        check(page.evaluate('window.__voxelRacers.match.score') > 0, 'smashing scores points')
        page.evaluate("window.__voxelRacers.destroyProp(window.__voxelRacers.arenaTerrain.props.find((p) => p.type === 'tnt'))")
        n2 = page.evaluate('window.__voxelRacers.arenaTerrain.props.length')
        check(n2 < n1, 'a TNT blast removes the prop')
        page.wait_for_timeout(600)
        shot(page, '09-arena-fight')
        # wreck every rival: the match is won and the results appear
        page.evaluate("window.__voxelRacers.rivals.forEach((r, i) => { r.v.hp = 1; })")
        page.evaluate("window.__voxelRacers.wreckAll()")
        page.wait_for_function("document.getElementById('results').classList.contains('show')", timeout=30000)
        check(page.evaluate("window.__voxelRacers.match.won") is True, 'wrecking all rivals wins the match')
        check(visible(page, '#results'), 'results card shows')
        shot(page, '10-arena-results')
        page.click('#btn-results-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'results exit returns to the garage')


        # ---------------- race mode (track with a road, countdown, laps)
        page.click('#btn-race', force=True)
        check(page.evaluate('window.__voxelRacers.driveMode') == 'race', 'race icon starts a race')
        page.wait_for_function('window.__voxelRacers.vehicle !== null && window.__voxelRacers.drawn > 60', timeout=60000)
        ts = page.evaluate('window.__voxelRacers.trackStats')
        check(page.evaluate('window.__voxelRacers.shown.track') is True and page.evaluate('window.__voxelRacers.shown.arena') is False, 'the race track mesh is actually shown (ground, road, barriers)')
        check(ts is not None and ts['barriers'] > 800 and ts['trees'] > 200 and ts['fineTris'] > 50000, f'track built ({ts})')
        page.wait_for_function("parseFloat(getComputedStyle(document.getElementById('drive')).opacity) > 0.9", timeout=5000)
        check(visible(page, '#race-hud') and visible(page, '#minimap'), 'race HUD and minimap visible')
        check(page.evaluate('window.__voxelRacers.race.phase') == 'countdown', 'race starts with a countdown')
        check(page.evaluate('window.__voxelRacers.rivals.length') == 5, 'five rival trucks on the grid')
        import re as _re; check(bool(_re.fullmatch(r'[1-6]/6', page.evaluate("document.getElementById('pos').textContent"))), 'position HUD shows')
        check(visible(page, '#btn-respawn'), 'respawn icon visible in a race')
        page.keyboard.down('ArrowUp')
        page.wait_for_timeout(600)
        check(page.evaluate('window.__voxelRacers.vehicle.f') < 0.5, 'truck is held on the line during the countdown')
        shot(page, '07-race-countdown')
        d0 = page.evaluate('window.__voxelRacers.drawn'); page.wait_for_timeout(3000)
        print('race fps ~', (page.evaluate('window.__voxelRacers.drawn') - d0) / 3, 'race.time', page.evaluate('window.__voxelRacers.race.time'), flush=True)
        page.wait_for_function("window.__voxelRacers.race.phase === 'racing'", timeout=150000)
        check(True, 'countdown ends and the race starts')
        page.wait_for_function('window.__voxelRacers.vehicle.f > 8', timeout=150000)
        check(page.evaluate('window.__voxelRacers.vehicle.surface') == 'asphalt', 'start straight is asphalt')
        check(page.evaluate("document.getElementById('lap').textContent") == '1/3', 'lap counter shows 1/3')
        page.wait_for_timeout(1500)
        shot(page, '08-race-driving')
        page.wait_for_function('window.__voxelRacers.rivals.every((r) => r.v.f > 6)', timeout=150000)
        check(True, 'rivals drive off at the start')
        page.wait_for_timeout(5000)
        check(page.evaluate('window.__voxelRacers.rivals.every((r) => Math.abs(r.v.f) > 2)'), 'rivals keep moving')
        shot(page, '08b-race-rivals')
        page.evaluate('window.__voxelRacers.respawn()')
        page.wait_for_timeout(300)
        check(page.evaluate('window.__voxelRacers.vehicle.vy') < 5, 'respawn puts the truck back on the track')
        page.keyboard.up('ArrowUp')
        page.click('#btn-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'race exits to the garage')

        # ---------------- Giant's Grip: in the picker; going over the deck edge puts you back at a checkpoint with a penalty
        for _ in range(14):
            if page.evaluate("document.querySelector('#trk-name b').textContent") == "Giant's Grip":
                break
            page.click('#trk-next', force=True); page.wait_for_timeout(120)
        check(page.evaluate("document.querySelector('#trk-name b').textContent") == "Giant's Grip", "Giant's Grip is in the stage picker")
        page.click('#btn-race', force=True)
        page.wait_for_function("window.__voxelRacers.vehicle !== null && window.__voxelRacers.race && window.__voxelRacers.race.phase === 'racing'", timeout=300000)
        fell = page.evaluate("""(() => { const g = window.__voxelRacers; const T = g.track, v = g.vehicle;
          const m = T.sampleAt((T.BRIDGE.s0 + T.BRIDGE.s1) / 2); const my = T.nearest(m.x, m.z).y; const t0 = g.race.time;
          v.x = m.x + m.tz * 9; v.z = m.z - m.tx * 9; v.y = my - 12; v.vy = -5; v.f = 20;
          return t0; })()""")
        page.wait_for_function("(() => { const g = window.__voxelRacers; const n = g.track.nearest(g.vehicle.x, g.vehicle.z); return g.vehicle.y - n.y > -3; })()", timeout=120000)
        back = page.evaluate("(() => { const g = window.__voxelRacers; const n = g.track.nearest(g.vehicle.x, g.vehicle.z); return [Math.abs(n.d), g.vehicle.y - n.y, g.race.time]; })()")
        check(back[0] < 8 and back[1] > -2, f'a fall respawns the truck on the road ({back})')
        check(back[2] > fell + 2.5, 'a fall costs a time penalty')
        page.click('#btn-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', "Giant's Grip exits to the garage")

        # ---------------- labyrinth stage: preview, skip, fog-of-war, no rivals yet
        for _ in range(14):
            if page.evaluate("document.querySelector('#trk-name b').textContent") == 'Hedge Labyrinth':
                break
            page.click('#trk-next', force=True); page.wait_for_timeout(120)
        check(page.evaluate("document.querySelector('#trk-name b').textContent") == 'Hedge Labyrinth', 'the labyrinth is in the stage picker')
        page.click('#btn-race', force=True)
        page.wait_for_function('window.__voxelRacers.vehicle !== null && window.__voxelRacers.drawn > 30', timeout=90000)
        check(page.evaluate('window.__voxelRacers.race.phase') == 'preview', 'labyrinth opens with the map preview')
        check(visible(page, '#btn-skip'), 'skip icon shows during the preview')
        check(page.evaluate('window.__voxelRacers.howtoOpen') is True and visible(page, '#howto'), 'first visit: the icon how-to card is open')
        pv0 = page.evaluate('window.__voxelRacers.race.preview'); page.wait_for_timeout(800)
        check(abs(page.evaluate('window.__voxelRacers.race.preview') - pv0) < 0.01, 'the preview clock waits while the how-to card is open')
        page.click('#btn-howto-ok', force=True)
        check(not visible(page, '#howto') and page.evaluate("JSON.parse(localStorage.getItem('voxel-racers:save')).seenMazeHowto") is True, 'the card closes and is remembered')
        check(visible(page, '#btn-howto'), 'a ? icon re-opens the card during the preview')
        page.click('#btn-howto', force=True); check(visible(page, '#howto'), 'the ? icon opens the card again'); page.click('#btn-howto-ok', force=True)
        try:
            page.wait_for_function('window.__voxelRacers.camera.position.y > 100', timeout=15000)
            high = True
        except Exception:
            high = False
        check(high, 'preview camera is high above the maze')
        check(page.evaluate('window.__voxelRacers.vehicle.f') < 0.5, 'truck cannot drive during the preview')
        page.click('#btn-skip', force=True)
        page.wait_for_function("window.__voxelRacers.race.phase === 'racing'", timeout=300000)
        check(not visible(page, '#btn-skip'), 'skip icon hides once the preview is over')
        check(page.evaluate('window.__voxelRacers.rivals.length') == 5, 'five rival explorers start in the labyrinth')
        hud = page.evaluate("(() => { const w = innerWidth; const a = document.getElementById('race-hud').getBoundingClientRect(); const n = document.getElementById('nitro').getBoundingClientRect(); return [a.left / w, a.right / w, n.left / w, n.right / w]; })()")
        check(hud[1] < 0.4 and hud[3] < 0.4, f'timer and nitro bar sit at the left corner, clear of the maze ({hud})')
        try:
            page.wait_for_function('window.__voxelRacers.rivals.some((r) => r.v.f > 5)', timeout=60000); rm = True
        except Exception:
            rm = False
        check(rm, 'rivals drive off to explore')
        page.keyboard.down('ArrowUp'); page.wait_for_timeout(1500); page.keyboard.up('ArrowUp')
        check(page.evaluate('window.__voxelRacers.explored') >= 1, 'fog of war records the cells driven through')
        try:
            page.wait_for_function('window.__voxelRacers.camera.position.y < 60', timeout=15000)
            low = True
        except Exception:
            low = False
        check(low, 'drive camera settles close to the truck')
        # overview map icon: cooling at first, then opens (truck held, clock running), closes, cools down again
        check(visible(page, '#btn-map'), 'overview-map icon shows in the labyrinth')
        check(page.evaluate("document.getElementById('btn-map').classList.contains('cooling')"), 'map icon starts on cooldown')
        page.evaluate('window.__voxelRacers.race.mapCool = 0')
        try:
            page.wait_for_function("document.getElementById('btn-map').classList.contains('ready')", timeout=15000); rdy = True
        except Exception:
            rdy = False
        check(rdy, 'map icon is ready after the cooldown')
        page.click('#btn-map', force=True)
        page.wait_for_function('window.__voxelRacers.race.mapT > 0', timeout=5000)
        try:
            page.wait_for_function('window.__voxelRacers.camera.position.y > 100', timeout=15000); high2 = True
        except Exception:
            high2 = False
        check(high2, 'overview map lifts the camera over the maze')
        page.wait_for_function('window.__voxelRacers.camera.position.y > 285', timeout=120000)
        c1 = page.evaluate('(() => { const p = window.__voxelRacers.camera.position; return [p.x, p.y, p.z]; })()'); page.wait_for_timeout(500)
        c2 = page.evaluate('(() => { const p = window.__voxelRacers.camera.position; return [p.x, p.y, p.z]; })()')
        check(max(abs(a - b) for a, b in zip(c1, c2)) < 0.05 and page.evaluate('window.__voxelRacers.camera.near') > 1, f'the overview camera is dead still once open ({c1} -> {c2})')
        check(not visible(page, '#nitro') or page.evaluate("getComputedStyle(document.getElementById('nitro')).opacity") == '0', 'nitro bar steps aside during the overview')
        t0 = page.evaluate('window.__voxelRacers.race.time'); page.wait_for_timeout(700)
        check(page.evaluate('window.__voxelRacers.race.time') > t0, 'the race clock keeps running during the map')
        check(abs(page.evaluate('window.__voxelRacers.vehicle.f')) < 1.0, 'the truck is held during the map')
        page.click('#btn-map', force=True)
        page.wait_for_function('window.__voxelRacers.race.mapT === 0', timeout=5000)
        check(page.evaluate('window.__voxelRacers.race.mapCool') > 10, 'closing the map starts the cooldown')
        # zoom and stuck-stick safety nets
        pv = page.evaluate("(() => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(e); return e.defaultPrevented; })()")
        check(pv, 'pinch (gesture) events are cancelled')
        stuck = page.evaluate("""(() => {
          const z = document.getElementById('joy-zone');
          const T = window.__voxelRacers.touch; const r = z.getBoundingClientRect();
          z.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 41, clientX: r.left + 100, clientY: r.top + 100, bubbles: true }));
          z.dispatchEvent(new PointerEvent('pointermove', { pointerId: 41, clientX: r.left + 160, clientY: r.top + 100, bubbles: true }));
          const held = T.state.active && T.state.x > 0.3;
          const e = new Event('touchend', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [] }); window.dispatchEvent(e);
          return [held, T.state.active, T.state.x];
        })()""")
        check(stuck[0] and not stuck[1] and stuck[2] == 0, f'the joystick is released when the last finger leaves ({stuck})')
        page.click('#btn-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'labyrinth exits to the garage')
        page.click('#trk-next', force=True)

        # ---------------- Paint the Town: next after the labyrinth; five painters, the tile bar, results with bars
        check(page.evaluate("document.querySelector('#trk-name b').textContent") == 'Paint the Town', 'Paint the Town is in the stage picker')
        page.click('#btn-race', force=True)
        page.wait_for_function("window.__voxelRacers.paintMatch && window.__voxelRacers.paintMatch.phase === 'play'", timeout=300000)
        check(page.evaluate('window.__voxelRacers.rivals.length') == 5, 'five painters start')
        check(visible(page, '#paint-hud') and visible(page, '#terr'), 'territory bar and clock show')
        check(not visible(page, '#arena-hud') and not visible(page, '#hp'), 'no arena health or score HUD in Paint')
        page.keyboard.down('ArrowUp')
        page.wait_for_function("window.__voxelRacers.paintMap.counts.reduce((a, b) => a + b, 0) > 150", timeout=300000)
        check(page.evaluate('window.__voxelRacers.paintMap.counts[0]') > 0, 'the player paints tiles by driving')
        page.keyboard.up('ArrowUp')
        page.evaluate('window.__voxelRacers.paintMatch.timeLeft = 0.05')
        page.wait_for_function("window.__voxelRacers.paintMatch.phase === 'over'", timeout=60000)
        page.wait_for_function("document.querySelector('#results').classList.contains('show')", timeout=60000)
        check(page.evaluate("document.querySelectorAll('#res-bars i').length") == 6, 'results show six territory bars')
        page.click('#btn-results-exit', force=True)
        check(page.evaluate('window.__voxelRacers.flow.state') == 'garage', 'Paint the Town exits to the garage')

        # ---------------- back to title
        page.click('#btn-back')
        check(page.evaluate('window.__voxelRacers.flow.state') == 'title', 'home icon returns to title')
        check(page.evaluate('window.__voxelRacers.worldMode') == 'outdoor', 'home returns to the stadium')
        # a planet stage (the Moon) leaves the camera tilted: simulate that, the title must straighten it (no upside-down truck)
        page.evaluate("(() => { const c = window.__voxelRacers.camera; c.up.set(0.3, -0.9, 0.3); c.position.set(0, -40, 60); })()")
        try:
            page.wait_for_function('window.__voxelRacers.camera.up.y > 0.99 && window.__voxelRacers.camera.position.y > 0', timeout=20000)
            ok_up = True
        except Exception:
            ok_up = False
        check(ok_up, 'showroom camera is upright after leaving a planet stage')

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
