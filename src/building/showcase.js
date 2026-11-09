// The Showcase: one button plays the whole showroom as a film, in one or two minutes. Outside in 3D, the rendered images,
// the times of day and the weather, then inside: floors, apartments in 3D, room by room in 360° and in both designs, and
// the commercial branch. Scenes run against the clock, so a slow build shortens a scene rather than the film running long.
// A view that has not been rendered is left out, and the others share its time.
// While it plays, any other building that blocks the view of the tower or looms in the foreground sinks out of the way.
import * as THREE from 'three';

// the captions' Russian
const RU = {
  'Baku City': 'Баку Сити', '16 floors · 139 apartments · a commercial branch': '16 этажей · 139 квартир · коммерческое отделение',
  'The exterior in 3D': 'Экстерьер в 3D', 'Fly anywhere around the building': 'Облетите здание с любой стороны',
  'Along the street': 'Вдоль улицы', 'The shopfront at eye level': 'Фасад на уровне глаз',
  'From the corner': 'С угла', 'Every side of the building': 'Здание со всех сторон',
  'Photoreal renders': 'Фотореалистичные рендеры', 'The street front': 'Фасад со стороны улицы', 'The whole complex': 'Весь комплекс', 'At street level': 'С уровня улицы', 'The garden': 'Сад',
  'Outside in 360°': 'Снаружи в 360°', 'Stand at the crossing and look around': 'Вид с пешеходного перехода', 'The garden between the blocks': 'Сад между корпусами', 'The courtyard': 'Внутренний двор', 'From the air': 'С высоты',
  'A whole day': 'Весь день', 'The real sun on its real path, from sunrise to sunset': 'Реальный путь солнца от рассвета до заката',
  Sunset: 'Закат', 'The real sun, at any time of day': 'Реальное солнце в любое время суток',
  Night: 'Ночь', 'Windows, shop fronts and the streets lit': 'Горят окна, витрины и улицы',
  'Night, at street level': 'Ночь на уровне улицы', 'Lamps along every street': 'Фонари вдоль каждой улицы',
  Winter: 'Зима', 'Snow on the roofs, the streets and the trees': 'Снег на крышах, улицах и деревьях',
  'A winter night': 'Зимняя ночь', 'Lit windows over fresh snow': 'Огни окон над свежим снегом',
  Rain: 'Дождь', 'Every season, before it is built': 'Любой сезон ещё до постройки',
  'Inside, floor by floor': 'Внутри, этаж за этажом', 'Every apartment, furnished': 'Все квартиры с мебелью',
  'Every room, from any angle': 'Каждая комната с любого ракурса', 'The living room': 'Гостиная', 'The bedroom': 'Спальня', 'The bathroom': 'Ванная', 'In 3D, from any angle': 'В 3D, с любого ракурса',
  'The 360° tour': 'Тур 360°', 'Warm minimal: the living room': 'Тёплый минимализм: гостиная', 'Warm minimal: the bedroom': 'Тёплый минимализм: спальня',
  'Another design, same room': 'Другой дизайн, та же комната', 'Hi-tech: anthracite stone, graphite and light': 'Хай-тек: антрацитовый камень, графит и свет',
  'Hi-tech': 'Хай-тек', 'The hall': 'Прихожая', "The children's room": 'Детская',
  'Hi-tech · Apartment 203': 'Хай-тек · Квартира 203', 'Hi-tech · Apartment 207': 'Хай-тек · Квартира 207', 'A 32 m² living room': 'Гостиная 32 м²',
  'The first floor': 'Первый этаж', 'A commercial branch and four apartments': 'Коммерческое отделение и четыре квартиры',
  'The branch in 3D': 'Отделение в 3D', 'Service hall, lounge, meeting rooms': 'Зал обслуживания, лаунж, переговорные',
  'The commercial branch': 'Коммерческое отделение', 'The entrance on the street': 'Вход с улицы', 'A modern customer branch on the first floor': 'Современное отделение на первом этаже',
  'The service hall': 'Зал обслуживания', 'The business lounge': 'Бизнес-лаунж', 'The boardroom': 'Переговорная', 'Now explore it yourself': 'Теперь исследуйте сами',
};
const ru = (t) => RU[t] ?? t.replace(/^Apartment (\d+) in 3D$/, 'Квартира $1 в 3D');
const FADE = 320; // ms, through black, which also hides the moment a scene is being set up
const HERO = { floor: 2, number: 5 }; // the apartment shown inside
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
// (a dev server answers a missing file with its index page, so ask for the image itself)
const exists = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });

// does the segment a -> b pass through a box from the ground to height h?
function hitsBox(a, b, [x0, z0, x1, z1], h) {
  let t0 = 0, t1 = 1;
  for (const [p, q, lo, hi] of [[a.x, b.x, x0, x1], [a.y, b.y, 0, h], [a.z, b.z, z0, z1]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

class StepAside {
  constructor({ site, complex, camera, atm, refreshShadows }) {
    Object.assign(this, { site, camera, atm, refreshShadows });
    this.blocks = [
      ...complex.children.filter((g) => g.userData.block).map((g) => ({ objs: [g], ...g.userData.block })),
      ...(site.userData.blocks ?? []),
    ].map((b) => ({ ...b, base: b.objs.map((o) => o.position.y), k: 0, down: false, clearSince: 0 }));
    // points on the tower that must stay in sight
    this.hero = [];
    for (const x of [-17, 0, 17]) for (const y of [6, 26, 50]) for (const z of [-17, 9]) this.hero.push(new THREE.Vector3(x, y, z));
    this.frames = 0;
  }
  blocking(b, heroDist) {
    const cam = this.camera.position, v = new THREE.Vector3();
    for (const box of b.boxes) {
      for (const p of this.hero) if (hitsBox(cam, p, box, b.h)) return true;
      if (this.atm.sunSprite.visible && hitsBox(cam, v.copy(cam).addScaledVector(this.atm.sunVec, 500), box, b.h)) return true;
      // looming in the foreground: nearer than the tower and covering a good part of the frame
      const dist = Math.hypot(Math.max(box[0] - cam.x, 0, cam.x - box[2]), Math.max(box[1] - cam.z, 0, cam.z - box[3]));
      if (dist > heroDist - 4) continue;
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1, behind = 0;
      for (const x of [box[0], box[2]]) for (const y of [0, b.h]) for (const z of [box[1], box[3]]) {
        v.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
        if (v.z > -0.5) { behind++; continue; }
        v.applyMatrix4(this.camera.projectionMatrix);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      if (behind >= 8) continue;
      if (behind) { x0 = -1; x1 = 1; }
      if (Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4 > 0.14) return true;
    }
    return false;
  }
  update(now, dt) {
    const heroDist = Math.hypot(this.camera.position.x, this.camera.position.y - 25, this.camera.position.z + 4);
    let moved = false;
    for (const b of this.blocks) {
      if (this.blocking(b, heroDist)) { b.down = true; b.clearSince = now; } else if (now - b.clearSince > 1400) b.down = false; // (no flicker as the view turns)
      const to = b.down ? 1 : 0;
      if (b.k === to) continue;
      b.k = to > b.k ? Math.min(1, b.k + dt / 0.9) : Math.max(0, b.k - dt / 0.9);
      this.place(b);
      moved = true;
    }
    if (moved && ++this.frames % 5 === 0) this.refreshShadows();
  }
  place(b) { b.objs.forEach((o, i) => { o.position.y = b.base[i] - (b.h + 2) * ease(b.k); }); }
  reset() {
    for (const b of this.blocks) { b.k = 0; b.down = false; b.clearSince = 0; this.place(b); }
    this.refreshShadows();
  }
}

export class Showcase {
  // ctx: { $, atm, camera, orbit, pano, animate, cancelMove, openFloor, backToBuilding, enterUnit, focusRoom, roomsNow, ensureInterior, floorOf, panoId, site, complex, refreshShadows }
  constructor(ctx) {
    Object.assign(this, ctx);
    const { $ } = ctx;
    this.el = { root: $('#showcase'), title: $('#sc-title'), sub: $('#sc-sub'), ru: $('#sc-ru'), bar: $('#sc-bar'), left: $('#sc-left'), still: $('#sc-still'), black: $('#sc-black'), wait: $('#sc-wait') };
    this.aside = new StepAside(ctx);
    $('#sc-skip').onclick = () => this.stop();
    addEventListener('keydown', (e) => { if (this.run && e.code === 'Escape') { e.stopImmediatePropagation(); this.stop(); } }, true);
  }

  sky(preset, weather = 'clear', season = 'summer') {
    document.querySelector(`#sky-season [data-s=${season}]`).click();
    document.querySelector(`#sky-weather [data-w=${weather}]`).click();
    document.querySelector(`#sky-presets [data-t=${preset}]`).click();
  }
  // stand at a spot and slowly circle what it looks at
  shot(pos, target, spin = 0.4, lens = 40) {
    this.cancelMove();
    this.camera.fov = lens;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(...pos);
    this.orbit.target.set(...target);
    this.camera.lookAt(this.orbit.target);
    this.orbit.autoRotate = spin !== 0;
    this.orbit.autoRotateSpeed = spin;
  }
  // a moving shot, from one spot to another
  move(from, to, s, lens = 40) {
    this.shot(from[0], from[1], 0, lens);
    this.animate(new THREE.Vector3(...to[0]), new THREE.Vector3(...to[1]), null, s);
  }
  still(src) {
    const { still } = this.el;
    still.hidden = false;
    still.src = src;
    still.classList.remove('kb');
    void still.offsetWidth; // restart the slow push-in
    still.classList.add('kb');
  }
  closePano() { if (document.body.dataset.pano) this.pano.close(); this.pano.pan = 0; }
  panoUrl({ id, stop, design }) { return `/pano/${id}/${design === 'hitech' ? 'hitech/' : ''}${stop}${this.pano.small ? '-2k' : ''}.jpg`; }

  // a whole day in a few seconds, with the sun on its path
  timelapse(s) {
    this.sky('sunrise');
    const token = (this.lapse = {}), from = this.atm.hour, to = from + (14 - 0.2), t0 = performance.now();
    this.atm.pathOn = true;
    this.atm.update({ full: false });
    const step = () => {
      if (this.lapse !== token) return;
      this.atm.hour = from + (to - from) * Math.min(1, (performance.now() - t0) / (s * 1000));
      this.atm.update({ full: false });
      setTimeout(step, 180);
    };
    step();
  }
  endLapse() { if (this.lapse) { this.lapse = null; this.atm.pathOn = false; } }

  // The film. `long: true` scenes are only in the two-minute version; `s` are its relative lengths.
  async scenes(length) {
    const full = length > 60;
    const heroUnit = this.floorOf(HERO.floor).units.find((u) => u.number === HERO.number);
    const branchUnit = this.floorOf(1).units.find((u) => u.kind === 'commercial');
    const hero = this.panoId(heroUnit), code = heroUnit.code;
    const still = (id, sub, long = false, s = 2.2) => ({ s, long, stillId: id, title: 'Photoreal renders', sub, go: () => this.still(`/renders/${id}.jpg`) });
    const room = (id, stop, design, title, sub, s = 3, long = false) => ({ s, long, pano: { id, stop, design }, title, sub, go: () => this.tour(id, stop, design) });
    const roomIn3D = (type, title, s = 3) => ({ s, long: true, soft: true, title, sub: 'In 3D, from any angle', go: () => { const r = this.roomsNow().find((x) => x.type === type); if (r) this.focusRoom(r); } });
    const dark = 'Hi-tech: anthracite stone, graphite and light';
    const list = [
      { s: 5, title: 'Baku City', sub: '16 floors · 139 apartments · a commercial branch', go: () => { this.sky('day'); this.shot([-70, 42, -95], [5, 22, 0], 0.55); } },
      { s: 4, title: 'The exterior in 3D', sub: 'Fly anywhere around the building', go: () => this.move([[-70, 42, -95], [5, 22, 0]], [[9, 1.8, -31], [0, 13, -16]], 3.8) },
      { s: 5, long: true, title: 'Along the street', sub: 'The shopfront at eye level', go: () => this.move([[-30, 1.8, -26], [0, 7, -16]], [[32, 1.8, -26], [10, 7, -16]], 4.6, 50) },
      { s: 5, long: true, title: 'From the corner', sub: 'Every side of the building', go: () => this.shot([52, 20, -66], [2, 20, -4], -0.7) },
      still('front', 'The street front'),
      still('aerial', 'The whole complex'),
      still('corner', 'From the corner'),
      still('street', 'At street level', true),
      still('garden', 'The garden', true),
      room('exterior', 'crosswalk', null, 'Outside in 360°', 'Stand at the crossing and look around'),
      room('exterior', 'garden', null, 'Outside in 360°', 'The garden between the blocks', 3, true),
      room('exterior', 'courtyard', null, 'Outside in 360°', 'The courtyard', 3, true),
      room('exterior', 'aerial', null, 'Outside in 360°', 'From the air', 3, true),
      { s: 8, long: true, title: 'A whole day', sub: 'The real sun on its real path, from sunrise to sunset', go: (c) => this.timelapse(c.seconds), setup: () => this.shot([-8, 30, -105], [0, 66, 40], 0, 78) },
      { s: 4, title: 'Sunset', sub: 'The real sun, at any time of day', go: () => { this.sky('sunset'); this.atm.hour -= 0.4; this.atm.update(); /* a little earlier: clear of the neighbouring blocks */ this.shot([110, 40, -46], [-10, 25, -52], 0.1, 60); } },
      { s: 4, title: 'Night', sub: 'Windows, shop fronts and the streets lit', go: () => { this.sky('night'); this.shot([-55, 28, -82], [4, 18, 8], -0.55); } },
      { s: 4, long: true, title: 'Night, at street level', sub: 'Lamps along every street', go: () => this.move([[-24, 2, -31], [2, 9, -16]], [[26, 2, -31], [4, 9, -16]], 3.8, 50) },
      { s: 4, title: 'Winter', sub: 'Snow on the roofs, the streets and the trees', go: () => { this.sky('day', 'snow', 'winter'); this.atm.snowLevel = 0.75; this.shot([52, 16, -72], [5, 12, 0], 0.55); } },
      { s: 4, long: true, title: 'A winter night', sub: 'Lit windows over fresh snow', go: () => { this.sky('night', 'snow', 'winter'); this.atm.snowLevel = 1; this.shot([-48, 16, -74], [3, 16, 0], -0.5); } },
      { s: 3, title: 'Rain', sub: 'Every season, before it is built', go: () => { this.sky('day', 'rain'); this.shot([-20, 2.2, -36], [4, 8, -16], 0.45); } },
      { s: 3, title: 'Inside, floor by floor', sub: 'Every apartment, furnished', go: () => { this.sky('day'); this.shot(this.camera.position.toArray(), this.orbit.target.toArray(), 0); this.openFloor(HERO.floor); } },
      { s: 4, title: `Apartment ${code} in 3D`, sub: 'Every room, from any angle', go: async () => { await this.enterUnit(heroUnit); this.orbit.autoRotate = true; this.orbit.autoRotateSpeed = 1.4; } },
      roomIn3D('living', 'The living room'),
      roomIn3D('bedroom', 'The bedroom'),
      roomIn3D('bath', 'The bathroom'),
      room(hero, 'living', 'classic', 'The 360° tour', 'Warm minimal: the living room', 4),
      room(hero, 'bedroom', 'classic', 'The 360° tour', 'Warm minimal: the bedroom', 3, true),
      room(hero, 'living', 'hitech', 'Another design, same room', dark, 4),
      room(hero, 'hall', 'hitech', 'Hi-tech', 'The hall', 3, true),
      room(hero, 'bedroom', 'hitech', 'Hi-tech', 'The bedroom'),
      room(hero, 'bath', 'hitech', 'Hi-tech', 'The bathroom'),
      room('f2-3', 'living', 'hitech', 'Hi-tech · Apartment 203', 'The living room'),
      room('f2-3', 'bedroom', 'hitech', 'Hi-tech · Apartment 203', 'The bedroom', 3, true),
      room('f2-3', 'kids', 'hitech', 'Hi-tech · Apartment 203', "The children's room"),
      room('f2-3', 'bath', 'hitech', 'Hi-tech · Apartment 203', 'The bathroom', 3, true),
      room('f2-7', 'living', 'hitech', 'Hi-tech · Apartment 207', 'A 32 m² living room', 3, true),
      room('f2-7', 'bedroom', 'hitech', 'Hi-tech · Apartment 207', 'The bedroom', 3, true),
      { s: 3, long: true, title: 'The first floor', sub: 'A commercial branch and four apartments', go: () => this.openFloor(1) },
      { s: 4, long: true, title: 'The branch in 3D', sub: 'Service hall, lounge, meeting rooms', go: async () => { await this.enterUnit(branchUnit); this.orbit.autoRotate = true; this.orbit.autoRotateSpeed = 0.9; } },
      room('f1-branch', 'lobby', null, 'The commercial branch', 'The entrance on the street', 3, true),
      room('f1-branch', 'welcome', null, 'The commercial branch', 'A modern customer branch on the first floor'),
      room('f1-branch', 'service', null, 'The commercial branch', 'The service hall', 3, true),
      room('f1-branch', 'business', null, 'The commercial branch', 'The business lounge', 3, true),
      room('f1-branch', 'boardroom', null, 'The commercial branch', 'The boardroom', 3, true),
      { s: 2.5, title: 'Baku City', sub: 'Now explore it yourself', go: () => {
        this.orbit.autoRotate = false;
        this.backToBuilding();
        this.shot([-62, 34, -88], [4, 22, 0], 0.5);
      } },
    ].filter((c) => full || !c.long);
    // leave out what has not been rendered yet
    const ok = await Promise.all(list.map((c) => {
      if (c.stillId) return exists(`/renders/${c.stillId}.jpg`);
      if (c.pano) return exists(`/pano/${c.pano.id}/${c.pano.design === 'hitech' ? 'hitech/' : ''}${c.pano.stop}-2k.jpg`);
      return true;
    }));
    const films = list.filter((_, i) => ok[i]);
    const k = (length - 2) / films.reduce((a, c) => a + c.s, 0); // 2 s in hand: the closing shot takes up whatever is left
    let at = 0;
    for (const c of films) { c.at = at; c.seconds = c.s * k; at += c.seconds; }
    return films;
  }
  // inside the 360° tour, turning slowly
  async tour(id, stop, design) {
    await this.pano.open(id, stop, design);
    this.pano.pan = 7;
  }

  async start(length = 60) {
    if (this.run) return;
    const me = (this.run = {});
    const { el, orbit } = this;
    document.body.dataset.showcase = '1';
    el.root.hidden = false;
    el.black.classList.add('on');
    el.wait.hidden = false;
    el.title.textContent = el.sub.textContent = el.ru.textContent = '';
    el.bar.style.width = '0';
    el.left.textContent = '';
    this.saved = { polar: orbit.maxPolarAngle, pathOn: this.atm.pathOn };
    orbit.maxPolarAngle = Math.PI - 0.05;
    this.atm.pathOn = false;

    // the floors are built before the clock starts, so the film never stops for them; panoramas load one scene ahead
    const films = await this.scenes(length);
    const floors = length > 60 ? [HERO.floor, 1] : [HERO.floor];
    const urls = new Set();
    const prefetch = (c) => { if (c?.pano) { const u = this.panoUrl(c.pano); urls.add(u); this.pano.texture(u).catch(() => {}); } };
    prefetch(films.find((c) => c.pano));
    await Promise.race([Promise.all(floors.map((n) => this.ensureInterior(this.floorOf(n)))), wait(20000)]);
    if (this.run !== me) return;
    el.wait.hidden = true;

    const t0 = performance.now();
    let last = t0;
    const tick = (now) => {
      if (this.run !== me) return;
      const s = (performance.now() - t0) / 1000;
      el.bar.style.width = `${Math.min(100, (s / length) * 100)}%`;
      const left = Math.max(0, Math.ceil(length - s));
      el.left.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (!document.body.dataset.pano && el.still.hidden && this.site.visible) this.aside.update(performance.now(), Math.min(0.1, (performance.now() - last) / 1000));
      last = performance.now();
      requestAnimationFrame(tick);
    };
    tick();
    for (let i = 0; i < films.length; i++) {
      const c = films[i], prev = films[i - 1];
      // within one tour the panoramas crossfade themselves; a room in 3D glides on from the last
      const soft = c.soft || (c.pano && prev?.pano && prev.pano.id === c.pano.id);
      if (!soft && i) { el.black.classList.add('on'); await wait(FADE); if (this.run !== me) return; }
      this.endLapse();
      if (!c.pano) this.closePano();
      if (!c.stillId) el.still.hidden = true;
      if (c.pano) { this.orbit.autoRotate = false; }
      c.setup?.();
      await c.go(c);
      if (this.run !== me) return;
      el.title.textContent = c.title;
      el.sub.textContent = c.sub;
      el.ru.innerHTML = `<b>${ru(c.title)}</b> · ${ru(c.sub)}`;
      el.black.classList.remove('on');
      prefetch(films[i + 1]);
      // the panorama before this one has faded out by now: free its memory
      if (prev?.pano && !c.pano) this.pano.release(this.panoUrl(prev.pano));
      else if (prev?.pano && this.panoUrl(prev.pano) !== this.panoUrl(c.pano)) { const u = this.panoUrl(prev.pano); setTimeout(() => this.pano.release(u), 900); }
      const nextSoft = films[i + 1] && (films[i + 1].soft || (films[i + 1].pano && c.pano?.id === films[i + 1].pano.id));
      const left = t0 + (films[i + 1]?.at ?? length) * 1000 - (nextSoft ? 0 : FADE) - performance.now();
      if (left > 0) await wait(left);
      if (this.run !== me) return;
    }
    el.black.classList.add('on');
    await wait(FADE);
    this.stats = { seconds: +((performance.now() - t0) / 1000).toFixed(1), scenes: films.length };
    this.stop();
  }

  stop() {
    if (!this.run) return;
    this.run = null;
    const { el, orbit } = this;
    this.endLapse();
    this.closePano();
    el.still.hidden = true;
    orbit.autoRotate = false;
    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    orbit.maxPolarAngle = this.saved.polar;
    this.atm.pathOn = this.saved.pathOn;
    this.pano.design = 'classic';
    this.pano.tour = null; // its design switch is rebuilt on the next open
    this.aside.reset();
    this.sky('day');
    delete document.body.dataset.showcase;
    el.root.hidden = true;
    el.black.classList.remove('on');
    this.backToBuilding();
  }
}
