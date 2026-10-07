import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[(Math.random() * a.length) | 0];
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---------------- Input ---------------- */
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { x: 0, y: 0 }; this.down = false; this.wheel = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.down = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = -(e.clientY / innerHeight) * 2 + 1; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.down = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.down = false; });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  is(c) { return this.keys.has(c); }
  was(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.wheel = 0; }
}

/* ---------------- Áudio procedural (sem arquivos) ---------------- */
export class Sfx {
  constructor() { this.ctx = null; }
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const osc = (type) => { const o = this.ctx.createOscillator(); o.type = type; const g = this.ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master); o.start(); return [o, g]; };
    [this.eng, this.engG] = osc('sawtooth'); [this.sir, this.sirG] = osc('square');
  }
  burst(dur, freq, vol) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  }
  shot(k) { this.burst(k === 'shotgun' ? 0.35 : 0.12, k === 'smg' ? 3500 : 2500, k === 'shotgun' ? 0.9 : 0.5); }
  boom() { this.burst(1.2, 400, 1.2); }
  punch() { this.burst(0.08, 800, 0.5); }
  engine(s01, on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.engG.gain.setTargetAtTime(on ? 0.04 : 0, t, 0.1); this.eng.frequency.setTargetAtTime(45 + s01 * 150, t, 0.1); }
  siren(v) { if (!this.ctx) return; const t = this.ctx.currentTime; this.sirG.gain.setTargetAtTime(v * 0.02, t, 0.2); this.sir.frequency.setValueAtTime(700 + Math.sin(t * 6) * 250, t); }
}

/* ---------------- Partículas (InstancedMesh, 1 draw call) ---------------- */
export class Particles {
  constructor(scene, max = 700) {
    this.max = max; this.d = new THREE.Object3D(); this.idx = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial(), max);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = []; const c = new THREE.Color(); this.d.scale.setScalar(0.0001);
    for (let i = 0; i < max; i++) { this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, grow: 0, g: 0, on: false }); this.mesh.setColorAt(i, c); this.d.updateMatrix(); this.mesh.setMatrixAt(i, this.d.matrix); }
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, grow = 0, g = 0) {
    const i = this.idx; this.idx = (i + 1) % this.max; const q = this.p[i];
    Object.assign(q, { x, y, z, vx, vy, vz, life, max: life, s: size, grow, g });
    this.mesh.setColorAt(i, new THREE.Color(color)); this.mesh.instanceColor.needsUpdate = true;
  }
  burst(x, y, z, n, color, spd, life, size, grow = 0, g = 0) {
    for (let i = 0; i < n; i++) this.emit(x, y, z, rand(-spd, spd), rand(0, spd), rand(-spd, spd), life * rand(0.6, 1.2), size * rand(0.6, 1.2), color, grow, g);
  }
  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (q.life > 0) {
        q.life -= dt; q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        if (q.g > 0 && q.y < 0.1) { q.y = 0.1; q.vy *= -0.3; q.vx *= 0.7; q.vz *= 0.7; }
        const k = Math.max(0, q.life / q.max);
        const s = q.s * (q.grow > 0 ? (1 + (1 - k) * q.grow) * Math.min(1, k * 3) : k);
        this.d.position.set(q.x, q.y, q.z); this.d.scale.setScalar(Math.max(s, 0.001)); this.d.updateMatrix();
        this.mesh.setMatrixAt(i, this.d.matrix); q.on = true; dirty = true;
      } else if (q.on) {
        this.d.position.set(0, -50, 0); this.d.scale.setScalar(0.0001); this.d.updateMatrix();
        this.mesh.setMatrixAt(i, this.d.matrix); q.on = false; dirty = true;
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- Humanoide procedural (jogador, NPCs) ---------------- */
const HG = {
  body: new THREE.BoxGeometry(0.56, 0.7, 0.32), head: new THREE.SphereGeometry(0.19, 10, 8),
  leg: new THREE.BoxGeometry(0.22, 0.72, 0.24), arm: new THREE.BoxGeometry(0.16, 0.62, 0.18), hand: new THREE.BoxGeometry(0.14, 0.14, 0.14), gun: new THREE.BoxGeometry(1, 1, 1),
};
const SKINS = [0xf1c9a5, 0xd9a37c, 0x8d5a3c, 0x5c3a26];
export function makeHuman(o = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: o.skin ?? pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: o.shirt ?? new THREE.Color().setHSL(Math.random(), 0.5, 0.45) });
  const pants = new THREE.MeshLambertMaterial({ color: o.pants ?? pick([0x2b3a55, 0x333333, 0x5a4632, 0x44546a]) });
  const add = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
  add(HG.body, shirt, 0, 1.05, 0); add(HG.head, skin, 0, 1.58, 0);
  const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.15, 0.72, 0); g.add(p); add(HG.leg, pants, 0, -0.36, 0, p); return p; });
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.38, 1.36, 0); g.add(p); add(HG.arm, shirt, 0, -0.3, 0, p); add(HG.hand, skin, 0, -0.66, 0, p); return p; });
  const gun = add(HG.gun, new THREE.MeshLambertMaterial({ color: 0x1b1b1b }), 0, -0.68, 0.25, arms[1]); gun.scale.set(0.09, 0.12, 0.5); gun.visible = false;
  g.userData = { legs, arms, gun };
  return g;
}
export function animateHuman(h, phase, amp, pose, t = 0) {
  const { legs, arms } = h.userData;
  legs[0].rotation.x = Math.sin(phase) * amp; legs[1].rotation.x = -Math.sin(phase) * amp;
  arms[0].rotation.x = -Math.sin(phase) * amp * 0.9; arms[1].rotation.x = Math.sin(phase) * amp * 0.9;
  if (pose === 'aim') { arms[1].rotation.x = -1.5; arms[0].rotation.x = -1.2; }
  else if (pose === 'punch') arms[1].rotation.x = -1.5 * Math.sin(t * Math.PI);
  else if (pose === 'phone') arms[1].rotation.x = -2.5;
  else if (pose === 'wave') { arms[0].rotation.x = -1 + Math.sin(t * 9) * 0.6; arms[1].rotation.x = -0.4 + Math.sin(t * 7) * 0.3; }
}

/* ---------------- Marcador de objetivo (anel + feixe de luz) ---------------- */
export function makeMarker(color, r = 3, h = 40) {
  const g = new THREE.Group();
  const mat = (o) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: o });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32), mat(0.85)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 32), mat(0.18)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.38; g.add(disc);
  if (h > 0) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, h, 12, 1, true), mat(0.22)); b.position.y = h / 2; g.add(b); }
  g.userData.ring = ring; return g;
}
