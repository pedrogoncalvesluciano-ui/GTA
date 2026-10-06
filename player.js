import * as THREE from 'three';
import { makeHuman, animateHuman, clamp, angDiff } from './utils.js';

export const WEAPONS = {
  fists: { name: 'Punhos', dmg: 14, rate: 0.42, range: 1.9, melee: true },
  pistol: { name: 'Pistola', dmg: 26, rate: 0.3, range: 70, spread: 0.025, pellets: 1, auto: false, gun: 0.45, sfx: 'pistol' },
  smg: { name: 'Submetralhadora', dmg: 13, rate: 0.085, range: 60, spread: 0.07, pellets: 1, auto: true, gun: 0.6, sfx: 'smg' },
  shotgun: { name: 'Espingarda', dmg: 13, rate: 0.85, range: 30, spread: 0.16, pellets: 7, auto: false, gun: 0.8, sfx: 'shotgun' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export class Player {
  constructor(g) {
    this.g = g; this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.mesh = makeHuman({ shirt: 0xd2452b, pants: 0x1f2a44, skin: 0xd9a37c }); this.mesh.position.y = -0.9; this.root.add(this.mesh); g.scene.add(this.root);
    Object.assign(this, { x: -9.5, z: -99, y: 0, vy: 0, vx: 0, vz: 0, heading: 0, hp: 100, armor: 0, money: 500, owned: { fists: true, pistol: true }, ammo: { pistol: 48, smg: 0, shotgun: 0 },
      weapon: 'pistol', vehicle: null, interior: null, dodgeT: 0, dx: 0, dz: 0, cd: 0, held: false, phase: 0, dead: false, punchT: 0, speed: 0, hitCd: 0, noAmmoT: 0 });
  }

  update(dt) {
    const g = this.g, inp = g.input, w = g.world;
    this.hitCd -= dt; this.cd -= dt; this.noAmmoT -= dt;
    if (this.dead) { this.root.rotation.x = -Math.PI / 2; this.root.position.set(this.x, 0.35, this.z); return; }
    WEAPON_ORDER.forEach((k, i) => { if (inp.was('Digit' + (i + 1)) && this.owned[k]) this.weapon = k; });
    if (this.vehicle) return this.drive(dt);
    this.root.visible = true;

    let ix = (inp.is('KeyD') ? 1 : 0) - (inp.is('KeyA') ? 1 : 0), iz = (inp.is('KeyS') ? 1 : 0) - (inp.is('KeyW') ? 1 : 0);
    const len = Math.hypot(ix, iz); if (len > 0) { ix /= len; iz /= len; }
    let sp = inp.is('ShiftLeft') || inp.is('ShiftRight') ? 8.2 : 4.4;
    if (this.dodgeT > 0) { this.dodgeT -= dt; sp = 12.5; ix = this.dx; iz = this.dz; }
    else if (inp.was('Space') && this.y <= 0.001) { if (len > 0) { this.dodgeT = 0.45; this.dx = ix; this.dz = iz; } else this.vy = 7.5; }
    this.vy -= 24 * dt; this.y = Math.max(0, this.y + this.vy * dt); if (this.y === 0) this.vy = Math.max(0, this.vy);
    const k = Math.min(1, dt * 12); this.vx += (ix * sp - this.vx) * k; this.vz += (iz * sp - this.vz) * k;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (this.interior) { const b = w.interiors[this.interior].b; this.x = clamp(nx, b.x0, b.x1); this.z = clamp(nz, b.z0, b.z1); }
    else { if (w.isLand(nx, this.z)) this.x = nx; if (w.isLand(this.x, nz)) this.z = nz; w.resolve(this, 0.42); }
    this.speed = Math.hypot(this.vx, this.vz);

    const armed = this.weapon !== 'fists';
    let target = this.heading;
    if (this.dodgeT > 0) target = Math.atan2(this.dx, this.dz);
    else if (armed || inp.down) target = Math.atan2(g.mouseWorld.x - this.x, g.mouseWorld.z - this.z);
    else if (len > 0) target = Math.atan2(ix, iz);
    this.heading += angDiff(this.heading, target) * Math.min(1, dt * 16);

    const wp = WEAPONS[this.weapon];
    if (inp.down && this.cd <= 0 && this.dodgeT <= 0 && !g.paused) {
      if (wp.melee) this.punch();
      else if ((this.ammo[this.weapon] || 0) > 0) { if (wp.auto || !this.held) this.fire(); }
      else if (!this.held && this.noAmmoT <= 0) { g.ui.notify('Sem munição! Compre na Loja de Armas.', 'bad'); this.noAmmoT = 2; }
    }
    this.held = inp.down;

    this.phase += this.speed * dt * 1.8; this.punchT = Math.max(0, this.punchT - dt * 4);
    const gun = this.mesh.userData.gun; gun.visible = armed; if (armed) gun.scale.z = wp.gun;
    animateHuman(this.mesh, this.phase, Math.min(1, this.speed / 5), armed ? 'aim' : this.punchT > 0 ? 'punch' : null, 1 - this.punchT);
    this.root.position.set(this.x, this.y + 0.9, this.z); this.root.rotation.y = this.heading; this.root.rotation.x = this.dodgeT > 0 ? (1 - this.dodgeT / 0.45) * Math.PI * 2 : 0;
  }

  drive(dt) {
    const g = this.g, inp = g.input, v = this.vehicle, i = v.input;
    i.throttle = inp.is('KeyW') ? 1 : 0; i.brake = inp.is('KeyS') ? 1 : 0; i.reverse = inp.is('KeyS'); i.steer = (inp.is('KeyA') ? 1 : 0) - (inp.is('KeyD') ? 1 : 0); i.hb = inp.is('Space');
    this.x = v.x; this.z = v.z; this.speed = Math.abs(v.speed); this.root.visible = false;
    if (inp.was('KeyF')) g.vehicles.exit(this);
  }

  fire() {
    const g = this.g, w = WEAPONS[this.weapon]; this.ammo[this.weapon]--; this.cd = w.rate;
    let dx = g.mouseWorld.x - this.x, dz = g.mouseWorld.z - this.z; const L = Math.hypot(dx, dz);
    if (L < 1) { dx = Math.sin(this.heading); dz = Math.cos(this.heading); } else { dx /= L; dz /= L; }
    const ox = this.x + dx * 0.8, oz = this.z + dz * 0.8;
    g.hitscan({ owner: 'player', x: ox, y: 1.25, z: oz, dx, dz, range: w.range, dmg: w.dmg, spread: w.spread, pellets: w.pellets });
    g.sfx.shot(w.sfx); g.flash(ox, oz); g.shake = Math.min(1.2, g.shake + 0.1); g.peds.alertShot(this.x, this.z); g.police.addHeat(0.9);
  }

  punch() {
    const g = this.g, w = WEAPONS.fists; this.cd = w.rate; this.punchT = 1; const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const n of g.peds.list) {
      if (n.dead) continue; const dx = n.x - this.x, dz = n.z - this.z, d = Math.hypot(dx, dz);
      if (d < w.range && (dx * fx + dz * fz) / (d || 1) > 0.4) { g.sfx.punch(); g.peds.hit(n, w.dmg, 'player', true); g.police.reportCrime(3, n.x, n.z); break; }
    }
  }

  hurt(d) {
    if (this.dead || d <= 0) return;
    const a = Math.min(this.armor, d * 0.6); this.armor -= a; d -= a; this.hp -= d; this.g.ui.flash();
    if (this.hp <= 0) { this.hp = 0; this.g.killPlayer(); }
  }

  respawn(x, z) {
    this.dead = false; this.hp = 100; this.root.rotation.x = 0; this.vehicle = null; this.x = x; this.z = z; this.vx = this.vz = 0; this.y = 0; this.dodgeT = 0;
  }
      }
