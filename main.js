import * as THREE from 'three';
import { Input, Sfx, Particles, clamp, lerp, smooth } from './utils.js';
import { World } from './world.js';
import { Player } from './player.js';
import { VehicleSystem } from './vehicles.js';
import { Traffic, Police, Pedestrians } from './ai.js';
import { MissionManager } from './missions.js';
import { UI } from './ui.js';

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x8ecdf0, 220, 900);
    this.camera = new THREE.PerspectiveCamera(42, 1, 6, 1800); this.camOff = new THREE.Vector3(0, 44, 26);
    this.input = new Input(canvas); this.sfx = new Sfx(); this.fx = new Particles(this.scene, 700);
    this.time = 9; this.night = 0; this.shake = 0; this.paused = true; this.zoom = 1; this.userZoom = 1; this.cx = -9.5; this.cz = -99; this.respawnT = 0; this.respawnKind = '';
    this.mouseWorld = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
    this.tracers = []; this.flashT = 0;

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x556b3a, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -75; sc.right = sc.top = 75; sc.near = 1; sc.far = 300; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.muzzle = new THREE.PointLight(0xffc060, 0, 14, 2); this.scene.add(this.muzzle);
    const sp = []; for (let i = 0; i < 1200; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.15; sp.push(Math.cos(a) * Math.cos(e) * 1200, Math.sin(e) * 1200, Math.sin(a) * Math.cos(e) * 1200); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); this.scene.add(this.stars);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1), tm); m.visible = false; m.userData.life = 0; this.scene.add(m); this.tracers.push(m); }

    this.world = new World(this.scene); this.vehicles = new VehicleSystem(this); this.player = new Player(this); this.ui = new UI(this);
    this.traffic = new Traffic(this); this.police = new Police(this); this.peds = new Pedestrians(this); this.missions = new MissionManager(this);
    this.traffic.populate(); this.peds.populate(70);
    addEventListener('resize', () => this.resize()); this.resize();
    document.getElementById('start').onclick = () => { this.sfx.init(); this.paused = false; document.getElementById('overlay').style.display = 'none'; this.ui.notify('Dica: vá ao marcador amarelo "M" para iniciar a missão.'); };
    this.last = 0; requestAnimationFrame((t) => this.frame(t));
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0); this.last = t; const inp = this.input;
    if (inp.was('Escape')) { if (this.ui.shopOpen) this.ui.closeShop(); else if (this.ui.bigOpen) this.ui.toggleBig(); else if (document.getElementById('overlay').style.display === 'none') this.paused = !this.paused; }
    if (inp.was('KeyM') && !this.paused) this.ui.toggleBig();
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera); inp.endFrame();
  }

  update(dt) {
    const p = this.player, inp = this.input;
    this.time = (this.time + dt * 0.05) % 24; if (inp.was('KeyN')) this.time = (this.time + 3) % 24;
    this.updateEnv(); this.updateMouse();
    if (this.respawnT > 0) { this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(); }
    if (inp.was('KeyF') && !p.vehicle && !p.dead && !p.interior) this.vehicles.enter(p);
    p.update(dt); this.traffic.update(dt); this.police.update(dt); this.vehicles.update(dt); this.peds.update(dt);
    this.world.update(dt, this.night); this.missions.update(dt); this.interactions();
    this.updateEffects(dt); this.fx.update(dt); this.camUpdate(dt); this.ui.update(dt);
    if (p.vehicle) this.sfx.engine(Math.min(1, Math.abs(p.vehicle.speed) / 35), true); else this.sfx.engine(0, false);
  }

  updateEnv() {
    const a = ((this.time - 6) / 12) * Math.PI, sunH = Math.sin(a), d = smooth(-0.05, 0.3, sunH), du = Math.exp(-((sunH / 0.22) ** 2));
    this.night = 1 - smooth(-0.15, 0.12, sunH);
    const sky = new THREE.Color(0x070d1c).lerp(new THREE.Color(0x8ecdf0), d).lerp(new THREE.Color(0xf4a261), du * 0.6);
    this.scene.background = sky; this.scene.fog.color.copy(sky);
    const day = sunH > 0, el = Math.max(Math.abs(sunH) * 85, 14), side = Math.cos(a) * 80 * (day ? 1 : -1);
    this.sunOff = new THREE.Vector3(side, el, -25);
    this.sun.color.set(day ? 0xffffff : 0x7f9fff).lerp(new THREE.Color(0xff9a50), day ? du * 0.7 : 0);
    this.sun.intensity = day ? lerp(0.4, 2.6, smooth(0, 0.35, sunH)) : 0.35; this.hemi.intensity = lerp(0.3, 0.95, d);
    this.stars.material.opacity = this.night; this.stars.position.copy(this.camera.position);
  }
  updateMouse() {
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera); this.ray.ray.intersectPlane(this.plane, this.mouseWorld) || this.mouseWorld.set(this.player.x, 1, this.player.z);
  }

  camUpdate(dt) {
    const p = this.player, v = p.vehicle; let tx = p.x, tz = p.z, zt = 1;
    if (v) { tx += v.vx * 0.45; tz += v.vz * 0.45; zt = 1 + Math.min(Math.abs(v.speed), 40) / 55; }
    this.userZoom = clamp(this.userZoom + this.input.wheel * 0.08, 0.55, 1.8);
    this.zoom = lerp(this.zoom, zt * this.userZoom, Math.min(1, dt * 2.5));
    const k = p.interior ? 1 : Math.min(1, dt * 6); this.cx = lerp(this.cx, tx, k); this.cz = lerp(this.cz, tz, k);
    const o = this.camOff.clone().multiplyScalar(this.zoom), sx = (Math.random() - 0.5) * this.shake, sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.cx + o.x + sx, o.y, this.cz + o.z + sz); this.camera.lookAt(this.cx, 0, this.cz); this.shake *= Math.pow(0.02, dt);
    this.sun.position.set(this.cx + this.sunOff.x, this.sunOff.y, this.cz + this.sunOff.z); this.sun.target.position.set(this.cx, 0, this.cz);
  }

  /* ---------- interação ---------- */
  interactions() {
    const p = this.player; let best = null, bd = 1e9;
    for (const pad of this.world.pads) { if (pad.interior !== p.interior) continue; const d = Math.hypot(pad.x - p.x, pad.z - p.z); if (d < pad.r && d < bd) { best = pad; bd = d; } }
    let txt = best ? `[E] ${best.label}` : ''; const nv = !p.vehicle && !p.interior && !p.dead && this.vehicles.nearest(p.x, p.z, 2.8, (q) => q.occupant !== 'player');
    if (nv) txt += (txt ? '   ' : '') + '[F] Entrar no veículo'; else if (p.vehicle) txt += (txt ? '   ' : '') + '[F] Sair';
    this.ui.setPrompt(txt); if (best && this.input.was('KeyE') && !p.dead) best.onUse(this);
  }
  enterInterior(id) { this.ui.transition(() => { const p = this.player, I = this.world.interiors[id]; if (p.vehicle) this.vehicles.exit(p, true); p.interior = id; p.x = I.spawn.x; p.z = I.spawn.z; this.world.setInterior(id); this.cx = p.x; this.cz = p.z; }); }
  exitInterior() { this.ui.transition(() => { const p = this.player, e = this.world.exits[p.interior]; p.interior = null; p.x = e.x + 1; p.z = e.z; this.world.setInterior(null); this.cx = p.x; this.cz = p.z; }); }

  openShop(kind) {
    const P = () => this.player, add = (a) => (g) => a(g.player);
    const shops = {
      gun: ['Armas & Cia', [
        { label: 'Munição Pistola (+24)', price: 60, action: add((p) => (p.ammo.pistol += 24)) },
        { label: 'Submetralhadora + 90 balas', price: 700, action: add((p) => { p.owned.smg = true; p.ammo.smg += 90; }) },
        { label: 'Munição SMG (+90)', price: 120, action: add((p) => { if (!p.owned.smg) return false; p.ammo.smg += 90; }) },
        { label: 'Espingarda + 16 cartuchos', price: 550, action: add((p) => { p.owned.shotgun = true; p.ammo.shotgun += 16; }) },
        { label: 'Cartuchos (+16)', price: 90, action: add((p) => { if (!p.owned.shotgun) return false; p.ammo.shotgun += 16; }) },
        { label: 'Colete (+100)', price: 350, action: add((p) => (p.armor = 100)) }]],
      store: ['Conveniência', [
        { label: 'Kit médico (+50 vida)', price: 80, action: add((p) => (p.hp = Math.min(100, p.hp + 50))) },
        { label: 'Lanche (+15 vida)', price: 20, action: add((p) => (p.hp = Math.min(100, p.hp + 15))) }]],
      garage: ['Oficina', [
        { label: 'Reparar veículo', price: 100, action: (g) => { const v = g.player.vehicle; if (!v) { g.ui.notify('Entre com um veículo.', 'bad'); return false; } v.hp = v.T.hp; } },
        { label: 'Repintura rápida (limpa o Procurado)', price: 250, action: (g) => { const v = g.player.vehicle; if (!v || !g.police.stars) { g.ui.notify('Precisa estar de veículo e procurado.', 'bad'); return false; } v.P.paint.color.setHex(Math.random() * 0xffffff); g.police.clear(); } }]],
    };
    this.ui.openShop(...shops[kind]);
  }

  /* ---------- combate e efeitos ---------- */
  hitscan({ owner, x, y, z, dx, dz, range, dmg, spread, pellets = 1 }) {
    const p = this.player;
    for (let k = 0; k < pellets; k++) {
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 2 * spread, ddx = Math.sin(a), ddz = Math.cos(a);
      let best = this.world.rayStatic(x, z, ddx, ddz, range), tgt = null;
      const test = (ex, ez, r, obj, type) => { const ox = ex - x, oz = ez - z, t = ox * ddx + oz * ddz; if (t < 0 || t > best) return; const px = ox - ddx * t, pz = oz - ddz * t; if (px * px + pz * pz < r * r) { best = t; tgt = { obj, type }; } };
      for (const n of this.peds.list) if (!n.dead && n.root.visible) test(n.x, n.z, 0.5, n, 'ped');
      for (const v of this.vehicles.list) if (!v.dead && !(owner === 'player' && v === p.vehicle)) for (const c of v.circles()) test(c.x, c.z, c.r, v, 'veh');
      if (owner !== 'player' && !p.vehicle && !p.interior && !p.dead) test(p.x, p.z, 0.5, p, 'player');
      const ex = x + ddx * best, ez = z + ddz * best; this.addTracer(x, y, z, ex, ez);
      if (tgt) {
        if (tgt.type === 'ped') { this.peds.hit(tgt.obj, dmg, owner); this.fx.burst(ex, 1.2, ez, 4, 0xaa1111, 2.5, 0.35, 0.18, 0, 12); }
        else if (tgt.type === 'veh') { tgt.obj.damage(dmg * (owner === 'player' ? 0.5 : 0.6)); this.fx.burst(ex, 1, ez, 5, 0xffc040, 4, 0.3, 0.15, 0, 10); if (owner === 'player' && tgt.obj.occupant === 'police') this.police.addHeat(3); }
        else p.hurt(dmg);
      } else this.fx.burst(ex, 0.8, ez, 4, 0xffc040, 3, 0.25, 0.14, 0, 12);
    }
  }
  addTracer(x, y, z, ex, ez) {
    const t = this.tracers.find((m) => !m.visible); if (!t) return; const dx = ex - x, dz = ez - z, L = Math.hypot(dx, dz);
    t.position.set(x + dx / 2, y, z + dz / 2); t.scale.set(1, 1, L); t.rotation.y = Math.atan2(dx, dz); t.visible = true; t.userData.life = 0.07;
  }
  flash(x, z) { this.muzzle.position.set(x, 1.6, z); this.muzzle.intensity = 60; this.flashT = 0.05; }
  updateEffects(dt) {
    for (const t of this.tracers) if (t.visible && (t.userData.life -= dt) <= 0) t.visible = false;
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.muzzle.intensity = 0;
  }
  explosion(x, z, r, dmg, src) {
    const p = this.player; this.sfx.boom(); const dp = Math.hypot(p.x - x, p.z - z); this.shake = Math.min(1.6, this.shake + Math.max(0.2, 1.2 - dp / 80));
    this.fx.burst(x, 1.2, z, 28, 0xff8a1a, 9, 0.8, 1.8, 1.5, 4); this.fx.burst(x, 1.5, z, 18, 0x222222, 5, 2, 2.2, 2.5); this.fx.burst(x, 1, z, 20, 0xffd060, 14, 0.6, 0.35, 0, 20);
    for (const n of this.peds.list) { const d = Math.hypot(n.x - x, n.z - z); if (!n.dead && d < r * 1.4) this.peds.hit(n, dmg * (1 - d / (r * 1.4)) * 1.2, 'explosion'); }
    if (!p.vehicle && !p.dead && !p.interior && dp < r * 1.4) p.hurt(dmg * (1 - dp / (r * 1.4)));
    for (const v of this.vehicles.list) { if (v === src || v.dead) continue; const d = Math.hypot(v.x - x, v.z - z); if (d < r * 1.6) { v.damage(dmg * (1 - d / (r * 1.6))); v.vx += ((v.x - x) / (d || 1)) * 6; v.vz += ((v.z - z) / (d || 1)) * 6; } }
    if (dp < 60) this.police.addHeat(10);
  }

  /* ---------- morte / prisão ---------- */
  killPlayer() {
    const p = this.player; if (p.dead) return; p.dead = true; if (p.vehicle) this.vehicles.exit(p, true);
    this.ui.showWasted('WASTED'); this.missions.fail('você morreu'); this.respawnT = 3.5; this.respawnKind = 'dead';
  }
  busted() {
    const p = this.player; p.dead = true; this.ui.showWasted('BUSTED'); this.missions.fail('você foi preso'); this.respawnT = 3; this.respawnKind = 'busted';
  }
  respawn() {
    const p = this.player, dead = this.respawnKind === 'dead', e = this.world.exits[dead ? 'hospital' : 'police'];
    p.money -= Math.min(p.money, dead ? 100 : 200); p.respawn(e.x, e.z); p.interior = null; this.world.setInterior(null); this.police.clear(); this.ui.hideWasted(); this.cx = p.x; this.cz = p.z;
    this.ui.notify(dead ? 'Você foi socorrido no hospital (-$100).' : 'Você pagou multa e foi solto (-$200).');
  }
}

try {
  window.game = new Game();
} catch (e) {
  console.error(e);
  const o = document.getElementById('overlay');
  o.insertAdjacentHTML('beforeend', '<pre style="color:#f88;max-width:90vw;white-space:pre-wrap;margin-top:16px;font-size:13px">Erro ao iniciar: ' + e.message + '</pre>');
}
