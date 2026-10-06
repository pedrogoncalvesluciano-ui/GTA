import * as THREE from 'three';
import { clamp, makeHuman } from './utils.js';

export const VTYPES = {
  sedan: { len: 4.5, w: 1.9, accel: 13, maxSpeed: 28, maxRev: 8, brake: 26, steer: 0.55, grip: 6.5, hp: 100, wb: 2.7 },
  taxi: { len: 4.5, w: 1.9, accel: 13, maxSpeed: 28, maxRev: 8, brake: 26, steer: 0.55, grip: 6.5, hp: 100, wb: 2.7 },
  sport: { len: 4.3, w: 1.95, accel: 21, maxSpeed: 40, maxRev: 9, brake: 32, steer: 0.5, grip: 8, hp: 90, wb: 2.6 },
  police: { len: 4.6, w: 1.95, accel: 18, maxSpeed: 36, maxRev: 9, brake: 30, steer: 0.55, grip: 7.5, hp: 110, wb: 2.8 },
  van: { len: 5.4, w: 2.1, accel: 9, maxSpeed: 22, maxRev: 7, brake: 20, steer: 0.45, grip: 5.5, hp: 140, wb: 3.4 },
  moto: { len: 2.1, w: 0.8, accel: 18, maxSpeed: 36, maxRev: 5, brake: 24, steer: 0.75, grip: 10, hp: 55, wb: 1.3 },
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14).rotateZ(Math.PI / 2);
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3, ...o });

function buildMesh(type, color) {
  const T = VTYPES[type], g = new THREE.Group(), P = { wheels: [], front: [], sirens: [] };
  const paint = M(color, { roughness: 0.35, metalness: 0.55 }), glass = M(0x0d141c, { roughness: 0.1, metalness: 0.8 }), dark = M(0x111111, { roughness: 0.9, metalness: 0 });
  const tail = M(0x400000, { emissive: 0xff1111, emissiveIntensity: 0.35 }), head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 }); P.tail = tail; P.paint = paint;
  const part = (sx, sy, sz, x, y, z, m, par = g) => { const o = new THREE.Mesh(BOX, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; };
  if (type === 'moto') {
    part(0.38, 0.45, 1.1, 0, 0.78, 0.05, paint); part(0.34, 0.1, 0.6, 0, 1.04, -0.25, dark); part(0.2, 0.1, 0.05, 0, 0.9, -0.62, tail);
    const piv = new THREE.Group(); piv.position.set(0, 0.36, 0.78); g.add(piv); const fw = new THREE.Mesh(WHEEL, dark); fw.scale.x = 0.55; fw.castShadow = true; piv.add(fw);
    part(0.1, 0.7, 0.1, 0, 0.35, 0, dark, piv); part(0.8, 0.07, 0.07, 0, 0.72, -0.05, dark, piv); part(0.2, 0.2, 0.1, 0, 0.55, 0.1, head, piv);
    const rw = new THREE.Mesh(WHEEL, dark); rw.scale.x = 0.55; rw.position.set(0, 0.36, -0.75); rw.castShadow = true; g.add(rw);
    P.wheels.push(fw, rw); P.front.push(piv);
    const r = makeHuman({ shirt: 0x222222, pants: 0x222222 }); r.scale.setScalar(0.85); r.position.set(0, 0.28, -0.25); r.userData.legs.forEach((l) => (l.rotation.x = -1.25)); r.userData.arms.forEach((a) => (a.rotation.x = -1.15)); r.visible = false; g.add(r); P.rider = r;
  } else {
    const L = T.len, W = T.w, van = type === 'van', cl = van ? L * 0.72 : L * 0.5, cz = van ? -0.35 : -0.25;
    part(W, 0.62, L, 0, 0.6, 0, paint); part(W * 0.88, 0.55, cl, 0, 1.17, cz, glass); part(W * 0.9, 0.07, cl * 0.92, 0, 1.46, cz, paint);
    part(W * 0.96, 0.2, 0.12, 0, 0.45, L / 2, dark); part(W * 0.96, 0.2, 0.12, 0, 0.45, -L / 2, dark);
    for (const s of [-1, 1]) { part(0.34, 0.17, 0.06, s * W * 0.34, 0.72, L / 2 + 0.01, head); part(0.34, 0.17, 0.06, s * W * 0.34, 0.72, -L / 2 - 0.01, tail); }
    for (const sx of [-1, 1]) for (const sz of [0.31, -0.31]) {
      const piv = new THREE.Group(); piv.position.set(sx * (W / 2 - 0.05), 0.36, sz * L); g.add(piv);
      const w = new THREE.Mesh(WHEEL, dark); w.castShadow = true; piv.add(w); P.wheels.push(w); if (sz > 0) P.front.push(piv);
    }
    if (type === 'police') { const r = M(0xff0000, { emissive: 0xff0000, emissiveIntensity: 0.2 }), b = M(0x0044ff, { emissive: 0x0044ff, emissiveIntensity: 0.2 }); part(0.5, 0.12, 0.3, -0.4, 1.55, cz, r); part(0.5, 0.12, 0.3, 0.4, 1.55, cz, b); P.sirens = [r, b]; part(W * 0.5, 0.3, L * 0.3, 0, 0.8, 0, dark); }
    if (type === 'taxi') part(0.7, 0.2, 0.3, 0, 1.6, cz, M(0xffffff, { emissive: 0xffcc00, emissiveIntensity: 0.6 }));
  }
  g.userData.parts = P; return g;
}

let VID = 1;
export class Vehicle {
  constructor(game, type, x, z, h, color) {
    this.g = game; this.id = VID++; this.type = type; this.T = VTYPES[type]; this.x = x; this.z = z; this.heading = h; this.vx = this.vz = this.speed = this.lat = this.steerA = this.wheelRot = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, hb: false, reverse: false }; this.hp = this.T.hp; this.occupant = 'none'; this.dead = false; this.burn = 0; this.wreck = 0;
    this.ai = null; this.cop = null; this.smokeT = 0; this.remove = false; this.keep = false; this.parked = false; this.cruise = 12;
    this.mesh = buildMesh(type, color); this.mesh.rotation.order = 'YXZ'; this.P = this.mesh.userData.parts; game.scene.add(this.mesh); this.sync();
  }
  circles() {
    if (this.type === 'moto') return [{ x: this.x, z: this.z, r: 0.55 }];
    const f = this.T.len / 2 - this.T.w / 2, s = Math.sin(this.heading), c = Math.cos(this.heading);
    return [{ x: this.x + s * f, z: this.z + c * f, r: this.T.w / 2 }, { x: this.x - s * f, z: this.z - c * f, r: this.T.w / 2 }];
  }
  step(dt) {
    const T = this.T, I = this.input, w = this.g.world;
    let h = this.heading, s = Math.sin(h), c = Math.cos(h);
    let fwd = this.vx * s + this.vz * c, lat = this.vx * c - this.vz * s;
    if (this.dead) { I.throttle = 0; I.brake = 0.4; I.steer = 0; I.hb = false; I.reverse = false; }
    if (I.throttle > 0) { if (fwd < -0.5) fwd += T.brake * dt; else fwd += T.accel * I.throttle * (1 - clamp(fwd / T.maxSpeed, 0, 1)) * dt; }
    if (I.brake > 0) {
      if (fwd > 0.5) fwd -= T.brake * I.brake * dt;
      else if (I.reverse) fwd -= T.accel * 0.55 * (1 - clamp(-fwd / T.maxRev, 0, 1)) * dt;
      else fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), T.brake * dt);
    }
    if (!I.throttle && !I.brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 2.5 * dt);
    if (I.hb) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 9 * dt);
    const maxSt = T.steer / (1 + Math.abs(fwd) * 0.05);
    this.steerA += (I.steer * maxSt - this.steerA) * Math.min(1, dt * 8);
    h += ((this.steerA * fwd) / T.wb) * (I.hb ? 1.5 : 1) * dt; this.heading = h;
    lat *= Math.exp(-(I.hb ? 1.3 : T.grip) * dt);
    if (I.hb && Math.abs(fwd) > 8 && Math.abs(lat) > 2) this.g.fx.burst(this.x - Math.sin(h) * 1.5, 0.3, this.z - Math.cos(h) * 1.5, 1, 0xcccccc, 1, 0.6, 0.9, 2);
    s = Math.sin(h); c = Math.cos(h);
    this.vx = s * fwd + c * lat; this.vz = c * fwd - s * lat; this.speed = fwd; this.lat = lat; this.wheelRot += (fwd * dt) / 0.36;
    const ox = this.x, oz = this.z, nx = ox + this.vx * dt, nz = oz + this.vz * dt;
    if (!w.isLand(nx, nz)) { this.impact(Math.abs(fwd)); this.vx *= -0.3; this.vz *= -0.3; } else { this.x = nx; this.z = nz; }
    for (const cc of this.circles()) {
      const p = { x: cc.x, z: cc.z };
      if (w.resolve(p, cc.r)) { this.x += p.x - cc.x; this.z += p.z - cc.z; const vn = this.vx * w.nx + this.vz * w.nz; if (vn < 0) { this.vx -= vn * w.nx * 1.35; this.vz -= vn * w.nz * 1.35; this.impact(-vn); } }
    }
    if (this.dead) { this.burn -= dt; this.wreck += dt; this.smokeT -= dt; if (this.smokeT <= 0 && this.burn > 0) { this.smokeT = 0.08; this.g.fx.emit(this.x, 1, this.z, 0, 3, 0, 0.9, 1.2, 0xff7a1a, 1.5); this.g.fx.emit(this.x, 1.5, this.z, 0, 2.5, 0, 1.6, 1.4, 0x222222, 2.5); } }
    else if (this.hp < 35) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.15; this.g.fx.emit(this.x, 1.3, this.z, 0, 2, 0, 1.2, 1, 0x555555, 2); } }
    this.visual(dt);
  }
  impact(v) { if (v > 5) { this.damage((v - 5) * 4); if (this.occupant === 'player') { this.g.shake = Math.min(1, this.g.shake + v * 0.03); this.g.sfx.punch(); } } }
  damage(d) { if (this.dead) return; this.hp -= d; if (this.hp <= 0) this.explode(); }
  explode() {
    this.dead = true; this.burn = 14; this.hp = 0;
    if (this.occupant === 'player') this.g.vehicles.exit(this.g.player, true);
    this.occupant = 'none'; this.ai = null; this.cop = null;
    this.P.paint.color.setHex(0x1a1a1a); this.P.paint.metalness = 0; this.g.explosion(this.x, this.z, 7, 70, this);
  }
  visual() {
    const P = this.P, I = this.input; this.mesh.position.set(this.x, 0, this.z); this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = this.type === 'moto' ? -this.steerA * this.speed * 0.04 : -this.lat * 0.012;
    P.wheels.forEach((w) => (w.rotation.x = this.wheelRot)); P.front.forEach((f) => (f.rotation.y = this.steerA));
    P.tail.emissiveIntensity = I.brake > 0 || I.hb ? 1.8 : 0.35;
    if (P.rider) P.rider.visible = this.occupant !== 'none' && !this.dead;
    if (P.sirens.length) { const on = this.cop && this.cop.chasing && !this.dead, t = Math.floor(performance.now() / 150) % 2; P.sirens[0].emissiveIntensity = on && t ? 3 : 0.1; P.sirens[1].emissiveIntensity = on && !t ? 3 : 0.1; }
  }
}

export class VehicleSystem {
  constructor(game) {
    this.g = game; this.list = [];
    this.spot = new THREE.SpotLight(0xfff0cc, 0, 70, 0.55, 0.6, 1); this.spot.target = new THREE.Object3D(); game.scene.add(this.spot, this.spot.target);
  }
  spawn(type, x, z, h, color, opts = {}) { const v = new Vehicle(this.g, type, x, z, h, color); Object.assign(v, opts); this.list.push(v); return v; }
  nearest(x, z, maxD, filter) {
    let best = null, bd = maxD;
    for (const v of this.list) { if (v.dead || (filter && !filter(v))) continue; const d = Math.hypot(v.x - x, v.z - z) - v.T.len / 2; if (d < bd) { bd = d; best = v; } }
    return best;
  }
  enter(p) {
    const v = this.nearest(p.x, p.z, 2.8, (q) => q.occupant !== 'player'); if (!v) return false;
    if (v.occupant === 'ai' || v.occupant === 'police') { this.g.peds.spawnEjected(v.x + Math.cos(v.heading) * -2, v.z + Math.sin(v.heading) * 2); this.g.police.reportCrime(v.cop ? 25 : 12, v.x, v.z); }
    v.occupant = 'player'; v.ai = null; v.cop = null; v.parked = false; v.keep = true; p.vehicle = v; return true;
  }
  exit(p, force) {
    const v = p.vehicle; if (!v) return; const w = this.g.world, c = Math.cos(v.heading), s = Math.sin(v.heading), off = v.T.w / 2 + 1;
    const cands = [[-c * off, s * off], [c * off, -s * off], [-s * 3, -c * 3], [s * 3, c * 3]];
    let spot = { x: v.x + cands[0][0], z: v.z + cands[0][1] };
    for (const [dx, dz] of cands) { const t = { x: v.x + dx, z: v.z + dz }; if (w.isLand(t.x, t.z) && !w.resolve({ ...t }, 0.45)) { spot = t; break; } }
    if (Math.abs(v.speed) > 12 && !force) p.hurt(Math.abs(v.speed) - 8);
    p.x = spot.x; p.z = spot.z; p.vehicle = null; v.occupant = 'none'; v.input = { throttle: 0, brake: 1, steer: 0, hb: true, reverse: false };
  }
  update(dt) {
    const g = this.g, L = this.list;
    for (const v of L) {
      if (v.occupant === 'none' && !v.dead) { v.input.throttle = 0; v.input.brake = 0.6; v.input.hb = v.speed < 3; }
      v.step(dt);
    }
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) { const A = L[a], B = L[b]; if ((A.x - B.x) ** 2 + (A.z - B.z) ** 2 < 49) this.collide(A, B); }
    for (const v of L) {
      if (v.dead || Math.abs(v.speed) < 3.5) continue;
      for (const c of v.circles()) {
        for (const n of g.peds.list) if (!n.dead && n.hitCd <= 0 && Math.hypot(n.x - c.x, n.z - c.z) < c.r + 0.4) g.peds.hitByVehicle(n, v);
        const p = g.player; if (!p.vehicle && !p.dead && !p.interior && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.4 && p.hitCd <= 0) { p.hitCd = 0.6; p.hurt(Math.abs(v.speed) * 2.5); p.vx += v.vx * 0.3; p.vz += v.vz * 0.3; }
      }
    }
    const pl = g.player;
    for (let i = L.length - 1; i >= 0; i--) {
      const v = L[i], far = Math.hypot(v.x - pl.x, v.z - pl.z);
      if (v.remove || (v.dead && v.burn <= 0 && (far > 60 || v.wreck > 50)) || (!v.keep && v.occupant === 'none' && far > 380)) { g.scene.remove(v.mesh); L.splice(i, 1); }
    }
    const pv = pl.vehicle; this.spot.intensity = pv ? g.night * 90 : 0;
    if (pv) { const s = Math.sin(pv.heading), c = Math.cos(pv.heading); this.spot.position.set(pv.x + s * 2, 1, pv.z + c * 2); this.spot.target.position.set(pv.x + s * 12, 0, pv.z + c * 12); }
  }
  collide(A, B) {
    for (const ca of A.circles()) for (const cb of B.circles()) {
      let dx = ca.x - cb.x, dz = ca.z - cb.z; const d = Math.hypot(dx, dz), r = ca.r + cb.r; if (d >= r || d < 1e-4) continue;
      dx /= d; dz /= d; const pen = (r - d) * 0.5; A.x += dx * pen; A.z += dz * pen; B.x -= dx * pen; B.z -= dz * pen;
      const rv = (A.vx - B.vx) * dx + (A.vz - B.vz) * dz;
      if (rv < 0) { const j = (-(1.35) * rv) / 2; A.vx += j * dx; A.vz += j * dz; B.vx -= j * dx; B.vz -= j * dz; const dm = -rv; if (dm > 4) { A.damage((dm - 4) * 3); B.damage((dm - 4) * 3); if (A.occupant === 'player' || B.occupant === 'player') { this.g.shake = Math.min(1, this.g.shake + dm * 0.04); this.g.sfx.punch(); } } }
      return;
    }
  }
                  }
      
