import * as THREE from 'three';
import { clamp, angDiff, rand, pick, makeHuman, animateHuman } from './utils.js';
import { COLX, ROWZ } from './world.js';

const CAR_COLORS = [0xc0392b, 0x2c3e50, 0xf1f1f1, 0x1f6f4a, 0x34495e, 0xd4a017, 0x7f8c8d, 0x8e44ad, 0x2980b9];

/* ======================= TRÁFEGO ======================= */
export class Traffic {
  constructor(g) { this.g = g; this.target = 26; this.t = 0; }

  edge(minD, maxD, off = 3.6) {
    const g = this.g, w = g.world, p = g.player;
    for (let k = 0; k < 30; k++) {
      const i = (Math.random() * 9) | 0, j = (Math.random() * 10) | 0, d = (Math.random() * 4) | 0, n = w.neighbor(i, j, d); if (!n) continue;
      const a = w.nodePos(i, j), b = w.nodePos(n[0], n[1]), t = rand(0.2, 0.8); let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const x = a.x + (b.x - a.x) * t - dz * off, z = a.z + (b.z - a.z) * t + dx * off, dp = Math.hypot(x - p.x, z - p.z);
      if (dp < minD || dp > maxD || g.vehicles.list.some((v) => Math.hypot(v.x - x, v.z - z) < 8)) continue;
      return { i, j, ni: n[0], nj: n[1], x, z, h: Math.atan2(dx, dz) };
    }
    return null;
  }
  spawnCivil(e, type) {
    type = type || pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport', 'moto', 'moto']);
    const v = this.g.vehicles.spawn(type, e.x, e.z, e.h, pick(CAR_COLORS)); v.occupant = 'ai'; v.ai = { i: e.i, j: e.j, ni: e.ni, nj: e.nj, stuck: 0, rev: 0 };
    v.cruise = (type === 'moto' ? 14 : 11) + rand(-2, 3); v.vx = Math.sin(e.h) * 8; v.vz = Math.cos(e.h) * 8; return v;
  }
  attach(v) { // põe um veículo (ex.: viatura dispensada) no fluxo normal
    const w = this.g.world; let best = { d: 1e9 };
    for (let i = 0; i < 9; i++) for (let j = 0; j < 10; j++) { const d = Math.hypot(COLX[i] - v.x, ROWZ[j] - v.z); if (d < best.d) best = { d, i, j }; }
    const opts = []; for (let d = 0; d < 4; d++) { const n = w.neighbor(best.i, best.j, d); if (n) opts.push(n); }
    const n = pick(opts); v.ai = { i: best.i, j: best.j, ni: n[0], nj: n[1], stuck: 0, rev: 0 }; v.occupant = 'ai';
  }
  populate() {
    for (let k = 0; k < this.target; k++) { const e = this.edge(25, 230); if (e) this.spawnCivil(e); }
    for (let k = 0; k < 20; k++) { const e = this.edge(20, 300, 6.8); if (e) { const v = this.spawnCivil(e, pick(['sedan', 'sedan', 'taxi', 'van', 'sport'])); v.occupant = 'none'; v.ai = null; v.parked = true; v.vx = v.vz = 0; } }
  }

  advance(a) {
    const w = this.g.world, opts = [], di = Math.sign(a.ni - a.i), dj = Math.sign(a.nj - a.j);
    for (let d = 0; d < 4; d++) {
      const n = w.neighbor(a.ni, a.nj, d); if (!n || (n[0] === a.i && n[1] === a.j)) continue;
      const straight = Math.sign(n[0] - a.ni) === di && Math.sign(n[1] - a.nj) === dj; for (let k = 0; k < (straight ? 3 : 1); k++) opts.push(n);
    }
    if (!opts.length) opts.push([a.i, a.j]);
    const n = pick(opts); a.i = a.ni; a.j = a.nj; a.ni = n[0]; a.nj = n[1];
  }
  blocked(v, look) {
    const g = this.g, s = Math.sin(v.heading), c = Math.cos(v.heading);
    const chk = (x, z, r) => { const ox = x - v.x, oz = z - v.z, f = ox * s + oz * c; if (f < 1 || f > look) return false; return Math.abs(ox * c - oz * s) < 1.5 + r; };
    if (!g.player.vehicle && !g.player.interior && chk(g.player.x, g.player.z, 0.4)) return true;
    for (const n of g.peds.list) if (!n.dead && chk(n.x, n.z, 0.4)) return true;
    for (const o of g.vehicles.list) if (o !== v && !o.dead && chk(o.x, o.z, 1)) return true;
    return false;
  }
  drive(v, dt) {
    const g = this.g, w = g.world, a = v.ai, I = v.input, np = w.nodePos(a.ni, a.nj), pp = w.nodePos(a.i, a.j);
    let dx = np.x - pp.x, dz = np.z - pp.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const rx = -dz, rz = dx, s = (v.x - pp.x) * dx + (v.z - pp.z) * dz;
    if (s > L - 6) { this.advance(a); return; }
    const st = Math.min(s + 8 + Math.abs(v.speed) * 0.3, L), px = pp.x + dx * st + rx * 3.6, pz = pp.z + dz * st + rz * 3.6;
    const diff = angDiff(v.heading, Math.atan2(px - v.x, pz - v.z));
    let targ = Math.abs(diff) > 0.5 ? 5 : v.cruise;
    const dist = L - s;
    if (dist > 6 && dist < 18) { const ls = w.lightState(Math.abs(dx) > Math.abs(dz) ? 'x' : 'z'); if (ls === 'red' || (ls === 'yellow' && dist > 10)) targ = 0; }
    if (this.blocked(v, 6 + Math.abs(v.speed) * 0.7)) targ = 0;
    if (a.rev > 0) { a.rev -= dt; I.throttle = 0; I.brake = 1; I.reverse = true; I.steer = -clamp(diff * 2, -1, 1); I.hb = false; return; }
    I.reverse = false; I.hb = false; I.steer = clamp(diff * 2, -1, 1);
    const err = targ - v.speed;
    if (err > 0.5) { I.throttle = clamp(err * 0.3, 0.2, 1); I.brake = 0; } else if (err < -1) { I.throttle = 0; I.brake = clamp(-err * 0.25, 0.25, 1); } else { I.throttle = 0.15; I.brake = 0; }
    a.stuck = targ > 0 && Math.abs(v.speed) < 0.6 ? a.stuck + dt : 0; if (a.stuck > 3) { a.stuck = 0; a.rev = 1.2; }
  }

  update(dt) {
    const g = this.g, p = g.player;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.6; const n = g.vehicles.list.filter((v) => v.occupant === 'ai' && !v.dead && !v.cop).length;
      if (n < this.target) { const e = this.edge(100, 230); if (e) this.spawnCivil(e); }
    }
    for (const v of g.vehicles.list) {
      if (v.dead || !v.ai || (v.occupant !== 'ai')) continue;
      if (Math.hypot(v.x - p.x, v.z - p.z) > 270) { v.remove = true; continue; }
      this.drive(v, dt);
    }
  }
}

/* ======================= POLÍCIA / PROCURADO ======================= */
export class Police {
  constructor(g) { this.g = g; this.heat = 0; this.stars = 0; this.units = []; this.spawnT = 0; this.bustedT = 0; }
  starsFrom(h) { return h >= 220 ? 5 : h >= 150 ? 4 : h >= 90 ? 3 : h >= 45 ? 2 : h >= 15 ? 1 : 0; }
  addHeat(a) { const o = this.stars; this.heat = Math.min(300, this.heat + a); this.stars = this.starsFrom(this.heat); if (this.stars > o) this.g.ui.notify('Nível de procurado: ' + '★'.repeat(this.stars), 'bad'); }
  reportCrime(heat, x, z) {
    const g = this.g; let seen = g.peds.list.some((n) => !n.dead && Math.hypot(n.x - x, n.z - z) < 40) || this.units.some((u) => Math.hypot(u.x - x, u.z - z) < 90);
    this.addHeat(heat * (seen ? 1 : 0.35));
  }
  setWanted(n) { this.heat = [0, 15, 45, 90, 150, 220][n]; this.stars = n; if (n) this.g.ui.notify('Nível de procurado: ' + '★'.repeat(n), 'bad'); }
  clear() { this.heat = 0; this.stars = 0; this.bustedT = 0; }

  update(dt) {
    const g = this.g, p = g.player;
    this.units = this.units.filter((u) => !u.dead && !u.remove && g.vehicles.list.includes(u));
    const desired = [0, 1, 2, 3, 5, 7][this.stars];
    this.spawnT -= dt;
    if (this.stars > 0 && this.units.filter((u) => u.cop.chasing).length < desired && this.spawnT <= 0 && !p.interior) {
      this.spawnT = 2.5; const e = g.traffic.edge(75, 150);
      if (e) { const v = g.vehicles.spawn('police', e.x, e.z, e.h, 0xf4f4f4); v.occupant = 'police'; v.cop = { chasing: true, stuck: 0, rev: 0, cd: rand(0, 1) }; v.cruise = 14; v.vx = Math.sin(e.h) * 10; v.vz = Math.cos(e.h) * 10; this.units.push(v); }
    }
    let near = 1e9;
    for (const u of this.units) {
      const d = Math.hypot(u.x - p.x, u.z - p.z); near = Math.min(near, d);
      if (this.stars === 0 && u.cop.chasing) { u.cop.chasing = false; g.traffic.attach(u); u.occupant = 'ai'; continue; }
      if (u.cop.chasing) this.chase(u, dt, d);
    }
    const seen = near < 90; this.heat = Math.max(0, this.heat - (seen ? 0.3 : 3.5) * dt); const ns = this.starsFrom(this.heat);
    if (ns < this.stars) { this.stars = ns; if (!ns) g.ui.notify('Você despistou a polícia.', 'good'); }
    g.sfx.siren(this.stars > 0 && near < 120 ? 1 - near / 120 : 0);
    // prisão: polícia colada no jogador a pé
    if (this.stars > 0 && !p.vehicle && !p.dead && !p.interior && near < 5.5) { this.bustedT += dt; if (this.bustedT > 2.2) { this.bustedT = 0; g.busted(); } } else this.bustedT = Math.max(0, this.bustedT - dt);
  }
  chase(u, dt, d) {
    const g = this.g, p = g.player, I = u.input, c = u.cop, pv = p.vehicle;
    const tx = p.x + (pv ? pv.vx * 0.5 : 0), tz = p.z + (pv ? pv.vz * 0.5 : 0), diff = angDiff(u.heading, Math.atan2(tx - u.x, tz - u.z));
    c.cd -= dt;
    if (c.rev > 0) { c.rev -= dt; I.throttle = 0; I.brake = 1; I.reverse = true; I.steer = -clamp(diff * 2, -1, 1); return; }
    I.reverse = false; I.hb = false; I.steer = clamp(diff * 2.2, -1, 1);
    if (d < 10 && !pv) { I.throttle = 0; I.brake = 1; } else { I.throttle = Math.abs(diff) < 1.1 ? 1 : 0.5; I.brake = 0; }
    c.stuck = Math.abs(u.speed) < 1.2 && d > 6 ? c.stuck + dt : 0; if (c.stuck > 1.2 || (Math.abs(diff) > 2.2 && d < 20 && u.speed < 5)) { c.stuck = 0; c.rev = 1.1; }
    if (this.stars >= 2 && d < 28 && c.cd <= 0 && !p.interior && g.world.rayStatic(u.x, u.z, (tx - u.x) / d, (tz - u.z) / d, d) >= d - 0.5) {
      c.cd = 0.8; const dx = (tx - u.x) / d, dz = (tz - u.z) / d;
      g.hitscan({ owner: 'cop', x: u.x, y: 1.2, z: u.z, dx, dz, range: 32, dmg: 3 + this.stars, spread: 0.08, pellets: 1 }); g.sfx.shot('pistol');
    }
  }
}

/* ======================= PEDESTRES (máquina de estados) ======================= */
const WALK = 'walk', IDLE = 'idle', TALK = 'talk', FLEE = 'flee', FIGHT = 'fight', CALL = 'call', DEAD = 'dead';

export class Pedestrians {
  constructor(g) { this.g = g; this.list = []; }
  populate(n) { for (let i = 0; i < n; i++) { const p = this.make(); this.relocate(p, 20, 220); } }
  make() {
    const root = new THREE.Group(), mesh = makeHuman(); root.add(mesh); this.g.scene.add(root);
    const n = { root, mesh, x: 0, z: 0, heading: 0, state: WALK, t: 0, hp: 50, courage: Math.random(), speed: rand(1.6, 2.3), phase: 0, node: null, prev: null, target: null, hitCd: 0, atkCd: 0, fx: 0, fz: 0, dead: false, partner: null, hostile: false };
    this.list.push(n); return n;
  }
  corner() { return [(Math.random() * 9) | 0, (Math.random() * 10) | 0, Math.random() < 0.5 ? -1 : 1, Math.random() < 0.5 ? -1 : 1]; }
  relocate(n, minD, maxD) {
    const g = this.g, w = g.world;
    for (let k = 0; k < 20; k++) {
      const c = this.corner(), pos = w.walkPos(...c), d = Math.hypot(pos.x - g.player.x, pos.z - g.player.z);
      if (d < minD || d > maxD || !w.walkNeighbors(...c).length) continue;
      Object.assign(n, { x: pos.x, z: pos.z, node: c, prev: null, target: null, state: WALK, t: 0, hp: 50, dead: false, hitCd: 0, courage: Math.random(), hostile: false });
      n.mesh.rotation.x = 0; n.mesh.position.y = 0; n.root.visible = true; this.pickNext(n); return;
    }
  }
  pickNext(n) {
    const nb = this.g.world.walkNeighbors(...n.node), f = nb.filter((c) => !n.prev || c.join() !== n.prev.join());
    n.target = pick(f.length ? f : nb.length ? nb : [n.node]);
  }
  nearestCorner(x, z) {
    let i = clamp(Math.round((x + 240) / 60), 0, 8), j = 0, bd = 1e9; ROWZ.forEach((rz, k) => { if (Math.abs(rz - z) < bd) { bd = Math.abs(rz - z); j = k; } });
    return [i, j, x >= COLX[i] ? 1 : -1, z >= ROWZ[j] ? 1 : -1];
  }
  moveTo(n, tx, tz, sp, dt) {
    const w = this.g.world, dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz) || 1;
    n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
    const nx = n.x + (dx / d) * sp * dt, nz = n.z + (dz / d) * sp * dt;
    if (w.isLand(nx, n.z)) n.x = nx; if (w.isLand(n.x, nz)) n.z = nz; w.resolve(n, 0.35); return d;
  }

  /* ---- reações ---- */
  alertShot(x, z) {
    for (const n of this.list) {
      if (n.dead || ![WALK, IDLE, TALK].includes(n.state) || Math.hypot(n.x - x, n.z - z) > 45) continue;
      if (n.courage < 0.75) this.flee(n, x, z); else if (Math.random() < 0.4) { n.state = CALL; n.t = 0; }
    }
  }
  flee(n, x, z) { n.state = FLEE; n.t = 0; n.fx = x; n.fz = z; }
  hit(n, dmg, src, melee) {
    if (n.dead) return; n.hp -= dmg;
    if (n.hp <= 0) return this.die(n, src, melee);
    if (src === 'player') { this.g.police.reportCrime(5, n.x, n.z); if (n.courage > 0.55) { n.state = FIGHT; n.t = 0; n.hostile = true; } else this.flee(n, this.g.player.x, this.g.player.z); }
    else this.flee(n, n.x + rand(-5, 5), n.z + rand(-5, 5));
  }
  die(n, src, melee) {
    n.state = DEAD; n.t = 0; n.dead = true; n.mesh.rotation.x = -Math.PI / 2; n.mesh.position.y = 0.2;
    if (src === 'player') { this.g.police.reportCrime(20, n.x, n.z); if (melee) { this.g.player.money += (rand(10, 40)) | 0; } }
  }
  hitByVehicle(n, v) {
    n.hitCd = 0.5; const sp = Math.abs(v.speed); n.hp -= sp * 7; n.x += v.vx * 0.05; n.z += v.vz * 0.05;
    if (v.occupant === 'player') this.g.police.reportCrime(sp > 8 ? 14 : 6, n.x, n.z);
    if (n.hp <= 0) this.die(n, v.occupant === 'player' ? 'player' : 'car'); else this.flee(n, v.x, v.z);
  }
  spawnEjected(x, z) {
    let far = null, fd = -1; for (const n of this.list) { const d = Math.hypot(n.x - this.g.player.x, n.z - this.g.player.z); if (d > fd) { fd = d; far = n; } }
    if (!far) return; Object.assign(far, { x, z, dead: false, hp: 50, hostile: false }); far.mesh.rotation.x = 0; far.mesh.position.y = 0; far.node = this.nearestCorner(x, z); this.flee(far, this.g.player.x, this.g.player.z);
  }

  update(dt) {
    const g = this.g, p = g.player;
    for (const n of this.list) {
      n.t += dt; n.hitCd -= dt; n.atkCd -= dt;
      const d2 = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d2 > 230 * 230) { this.relocate(n, 70, 170); continue; }
      n.root.visible = d2 < 180 * 180;
      let pose = null, amp = 0.7, sp = 0, tPose = n.t;
      switch (n.state) {
        case WALK: {
          const tp = g.world.walkPos(...n.target), d = this.moveTo(n, tp.x, tp.z, n.speed, dt); sp = n.speed;
          if (d < 0.7) { n.prev = n.node; n.node = n.target; this.pickNext(n); const r = Math.random(); if (r < 0.15) { n.state = IDLE; n.t = 0; n.dur = rand(2, 6); } else if (r < 0.25) { n.state = TALK; n.t = 0; n.dur = rand(4, 9); } }
          break;
        }
        case IDLE: if (n.t > n.dur) { n.state = WALK; n.t = 0; } amp = 0; break;
        case TALK: pose = 'wave'; amp = 0; if (n.t > n.dur) { n.state = WALK; n.t = 0; } break;
        case CALL: pose = 'phone'; amp = 0; if (n.t > 4) { g.police.addHeat(8); n.state = WALK; n.t = 0; n.node = this.nearestCorner(n.x, n.z); this.pickNext(n); } break;
        case FLEE: {
          let dx = n.x - n.fx, dz = n.z - n.fz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; sp = 6.5; amp = 1.3;
          this.moveTo(n, n.x + dx * 5 + rand(-1, 1), n.z + dz * 5 + rand(-1, 1), sp, dt);
          if (n.t > rand(5, 8) && L > 25) { n.state = WALK; n.t = 0; n.node = this.nearestCorner(n.x, n.z); n.prev = null; this.pickNext(n); }
          break;
        }
        case FIGHT: {
          const d = Math.hypot(p.x - n.x, p.z - n.z); sp = 4.8; amp = 1;
          if (d > 1.3) this.moveTo(n, p.x, p.z, sp, dt); else { n.heading = Math.atan2(p.x - n.x, p.z - n.z); sp = 0; pose = 'punch'; tPose = (n.t * 3) % 1; if (n.atkCd <= 0 && !p.vehicle && !p.interior) { n.atkCd = 0.9; p.hurt(6); } }
          if (n.hp < 18 || d > 30 || p.dead) this.flee(n, p.x, p.z);
          break;
        }
        case DEAD: if (n.t > 14) this.relocate(n, 70, 170); continue;
      }
      n.phase += sp * dt * 2.2; animateHuman(n.mesh, n.phase, sp ? amp : 0, pose, tPose);
      n.root.position.set(n.x, 0, n.z); n.root.rotation.y = n.heading;
    }
  }
                                                                         }
    
