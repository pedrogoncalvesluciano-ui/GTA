import * as THREE from 'three';
import { rand, pick, makeHuman, makeMarker } from './utils.js';

/* Malha: ruas verticais em x = COLX, horizontais em z = ROWZ. Ilha Norte z<-60, Ilha Sul z>60, ponte em x=0. */
export const COLX = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROWZ = [-330, -270, -210, -150, -90, 90, 150, 210, 270, 330];
const BLOCKX = [-210, -150, -90, -30, 30, 90, 150, 210];
const BLOCKZ = [-300, -240, -180, -120, 120, 180, 240, 300];
const LAND = [{ x0: -300, x1: 300, z0: -360, z1: -60 }, { x0: -300, x1: 300, z0: 60, z1: 360 }, { x0: -8, x1: 8, z0: -60, z1: 60 }];
const CELL = 16, key = (cx, cz) => (cx + 100) * 1000 + (cz + 100);
const PAL = [0xb9c4cf, 0x9fb4c8, 0xc9b79c, 0x8f9aa6, 0xd3d3d3, 0x7e92a3];
const HOUSE = [0xf2e3c6, 0xe8c9b0, 0xc9dbe8, 0xd8e8c9, 0xf0c9c9, 0xe5e5e5];

export class World {
  constructor(scene) {
    this.scene = scene; this.grid = new Map(); this.pads = []; this.mapRects = []; this.glow = []; this.interiors = {}; this.exits = {};
    this.lightT = 0; this.lastPhase = ''; this.trees = []; this.palms = []; this.lamps = []; this.hit = false; this.nx = 0; this.nz = 0; this.matCache = new Map();
    this.boxG = new THREE.BoxGeometry(1, 1, 1); this.planeG = new THREE.PlaneGeometry(1, 1); this.roofG = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4); this.cylG = new THREE.CylinderGeometry(1, 1, 1, 16);
    const S = (c, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    this.S = S;
    this.M = { asphalt: S(0x2c2e33), side: S(0xa9a9a2), grass: S(0x5d9b48), sand: S(0xe6d6a4), conc: S(0x8d8d88), dirt: S(0x8a7a62), white: S(0xf2f2f2, 0.7), yellow: S(0xe8c533, 0.7), rail: S(0xbfc3c8, 0.5, 0.4), roof: S(0x6e6e72), dark: S(0x222428), red: S(0xc0392b), wood: S(0x8b5a2b),
      water: new THREE.MeshStandardMaterial({ color: 0x1d6fa5, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 }) };
    this.textures(); this.terrain(); this.roads(); this.bridge(); this.blocks(); this.furniture(); this.buildInteriors();
  }

  /* ---------- helpers ---------- */
  textures() {
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.winTex = mk((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3a4a5c'; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(6 + x * 32, 8 + y * 32, 20, 20); });
    this.glowTex = mk((g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if (Math.random() < 0.7) { g.fillStyle = Math.random() < 0.5 ? '#ffd98a' : '#fff2c4'; g.fillRect(6 + x * 32, 8 + y * 32, 20, 20); } });
  }
  bldMat(color, w, h) {
    const rx = Math.max(1, Math.round(w / 5)), ry = Math.max(1, Math.round(h / 4)), k = `${color}|${rx}|${ry}`;
    if (!this.matCache.has(k)) {
      const a = this.winTex.clone(), b = this.glowTex.clone(); a.repeat.set(rx, ry); b.repeat.set(rx, ry); a.needsUpdate = b.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, map: a, emissive: 0xffffff, emissiveMap: b, emissiveIntensity: 0 });
      this.glow.push(m); this.matCache.set(k, m);
    }
    return this.matCache.get(k);
  }
  addStatic(x0, z0, x1, z1) {
    const b = { x0, z0, x1, z1 };
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(b);
    }
  }
  rect(x0, z0, x1, z1, c) { this.mapRects.push([x0, z0, x1, z1, c]); }
  box(cx, cz, w, d, h, mat, o = {}) {
    const m = new THREE.Mesh(this.boxG, mat); m.scale.set(w, h, d); m.position.set(cx, (o.y || 0) + h / 2, cz);
    m.castShadow = o.cast !== false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m);
    if (o.solid) this.addStatic(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
    return m;
  }
  cyl(x, z, r, h, mat, y = 0.25) {
    const m = new THREE.Mesh(this.cylG, mat); m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m);
    this.addStatic(x - r, z - r, x + r, z + r); return m;
  }
  bld(cx, cz, w, d, h, color, o = {}) {
    const mat = this.bldMat(color, w, h), m = new THREE.Mesh(this.boxG, [mat, mat, this.M.roof, this.M.roof, mat, mat]);
    m.scale.set(w, h, d); m.position.set(cx, 0.25 + h / 2, cz); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m);
    this.addStatic(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2); this.rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, o.map || '#7d8794');
    return m;
  }
  sign(text, w, h, x, y, z, ry, bg = '#1b2a4a') {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round((256 * h) / w); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.font = `bold ${c.height * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(this.planeG, new THREE.MeshBasicMaterial({ map: t })); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
  }
  addPad(p) {
    const colors = { door: 0x4fc3ff, shop: 0x6bff7a, exit: 0xff8f4f, garage: 0xffe14f };
    p.interior = p.interior || null; p.marker = makeMarker(colors[p.kind] || 0xffffff, p.r * 0.9, 0); p.marker.position.set(p.x, 0, p.z); p.marker.visible = p.interior === null; this.scene.add(p.marker); this.pads.push(p);
  }
  setInterior(id) { for (const p of this.pads) p.marker.visible = p.interior === id; }
  instanced(geo, mat, list, fn, cast = false) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), d = new THREE.Object3D();
    list.forEach((it, i) => { fn(d, it); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.count = list.length; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; this.scene.add(m); return m;
  }

  /* ---------- grafo viário ---------- */
  nodePos(i, j) { return { x: COLX[i], z: ROWZ[j] }; }
  neighbor(i, j, d) { // 0:+x 1:-x 2:+z 3:-z
    const ni = i + [1, -1, 0, 0][d], nj = j + [0, 0, 1, -1][d];
    if (ni < 0 || ni > 8 || nj < 0 || nj > 9) return null;
    if (d >= 2 && ((j === 4 && nj === 5) || (j === 5 && nj === 4)) && i !== 4) return null;
    return [ni, nj];
  }
  walkPos(i, j, sx, sz) { return { x: COLX[i] + sx * 9.5, z: ROWZ[j] + sz * 9.5 }; }
  walkNeighbors(i, j, sx, sz) { // cantos de calçada: atravessar na faixa ou seguir pela calçada
    const out = [], aZ = this.neighbor(i, j, sz > 0 ? 2 : 3), aX = this.neighbor(i, j, sx > 0 ? 0 : 1);
    if (aZ) { out.push([i, j, -sx, sz]); if (!((j === 4 && aZ[1] === 5) || (j === 5 && aZ[1] === 4))) out.push([i, aZ[1], sx, -sz]); }
    if (aX) { out.push([i, j, sx, -sz]); out.push([aX[0], j, -sx, sz]); }
    return out;
  }
  lightState(axis) { const t = this.lightT % 20; if (axis === 'z') return t < 8 ? 'green' : t < 10 ? 'yellow' : 'red'; return t < 10 ? 'red' : t < 18 ? 'green' : 'yellow'; }

  /* ---------- colisão ---------- */
  isLand(x, z) { for (const l of LAND) if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return true; return false; }
  resolve(p, r) {
    this.hit = false;
    for (let cx = Math.floor((p.x - r) / CELL); cx <= Math.floor((p.x + r) / CELL); cx++) for (let cz = Math.floor((p.z - r) / CELL); cz <= Math.floor((p.z + r) / CELL); cz++) {
      const arr = this.grid.get(key(cx, cz)); if (!arr) continue;
      for (const b of arr) {
        const qx = Math.max(b.x0, Math.min(p.x, b.x1)), qz = Math.max(b.z0, Math.min(p.z, b.z1)), dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else { const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bo = b.z1 - p.z, m = Math.min(l, rr, t, bo);
          if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; } else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = bo + r; } }
        p.x += nx * pen; p.z += nz * pen; this.hit = true; this.nx = nx; this.nz = nz;
      }
    }
    return this.hit;
  }
  rayStatic(ox, oz, dx, dz, max) {
    for (let t = 0.5; t < max; t += 0.6) {
      const x = ox + dx * t, z = oz + dz * t, arr = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (arr) for (const b of arr) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return t;
    }
    return max;
  }

  /* ---------- terreno, estradas e ponte ---------- */
  terrain() {
    const M = this.M, w = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), M.water); w.rotation.x = -Math.PI / 2; w.position.y = -1.6; w.receiveShadow = true; this.scene.add(w);
    this.rect(-400, -400, 400, 400, '#1d4f7a');
    this.box(0, -210, 600, 300, 4, M.sand, { y: -4.02, cast: false }); this.box(0, 210, 600, 300, 4, M.sand, { y: -4.02, cast: false });
    this.box(0, -210, 540, 270, 4, M.grass, { y: -4, cast: false }); this.box(0, 182.5, 540, 215, 4, M.grass, { y: -4, cast: false });
    this.rect(-300, -360, 300, -60, '#e6d6a4'); this.rect(-300, 60, 300, 360, '#e6d6a4'); this.rect(-270, -345, 270, -75, '#5d9b48'); this.rect(-270, 75, 270, 290, '#5d9b48');
  }
  plane(cx, cz, w, d, mat, y) { const m = new THREE.Mesh(this.planeG, mat); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(cx, y, cz); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m); }
  roads() {
    const M = this.M, dashes = [], stripes = [];
    for (const x of COLX) {
      this.plane(x, -210, 14, 254, M.asphalt, 0.04); this.plane(x, 210, 14, 254, M.asphalt, 0.04); this.rect(x - 7, -337, x + 7, -83, '#3a3d44'); this.rect(x - 7, 83, x + 7, 337, '#3a3d44');
    }
    this.plane(0, 0, 14, 170, M.asphalt, 0.04); this.rect(-7, -83, 7, 83, '#3a3d44');
    for (const z of ROWZ) { this.plane(0, z, 494, 14, M.asphalt, 0.05); this.rect(-247, z - 7, 247, z + 7, '#3a3d44'); }
    // faixa central tracejada + faixas de pedestre
    for (let i = 0; i < 9; i++) for (let j = 0; j < 10; j++) {
      const { x, z } = this.nodePos(i, j);
      for (let d = 0; d < 4; d++) {
        const n = this.neighbor(i, j, d); if (!n) continue;
        const nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0;
        if (d === 0 || d === 2) { const e = this.nodePos(n[0], n[1]), L = Math.hypot(e.x - x, e.z - z); for (let t = 12; t < L - 12; t += 6) dashes.push([x + nx * t, z + nz * t, nz !== 0]); }
        for (let k = -3; k <= 3; k++) stripes.push([x + nx * 10 + (nz !== 0 ? k * 1.8 : 0), z + nz * 10 + (nx !== 0 ? k * 1.8 : 0), nz !== 0]);
      }
    }
    this.instanced(this.boxG, M.yellow, dashes, (d, [x, z, v]) => { d.position.set(x, 0.1, z); d.rotation.set(0, 0, 0); d.scale.set(v ? 0.3 : 3, 0.03, v ? 3 : 0.3); });
    this.instanced(this.boxG, M.white, stripes, (d, [x, z, v]) => { d.position.set(x, 0.1, z); d.rotation.set(0, 0, 0); d.scale.set(v ? 0.9 : 3.2, 0.03, v ? 3.2 : 0.9); });
  }
  bridge() {
    const M = this.M; this.box(0, 0, 17, 120, 1.2, M.conc, { y: -1.18 });
    for (const s of [-1, 1]) this.box(s * 8.2, 0, 0.4, 120, 1.1, M.rail, { y: 0.02, solid: true });
    for (const z of [-45, -15, 15, 45]) { this.cyl(0, z, 1.6, 8, M.conc, -4.5); this.lamps.push([8.5, z], [-8.5, z]); }
    const cables = [];
    for (const tz of [-35, 35]) { for (const s of [-1, 1]) this.box(s * 9.2, tz, 1.4, 1.4, 30, M.rail, { y: -1 }); this.box(0, tz, 19, 1.2, 1.2, M.rail, { y: 27 }); }
    for (const s of [-1, 1]) {
      const pts = [[-60, 0.5], [-35, 29]]; for (let z = -35; z <= 35; z += 5) pts.push([z, 1 + 28 * (z / 35) ** 2]); pts.push([35, 29], [60, 0.5]);
      for (let k = 0; k < pts.length - 1; k++) cables.push(s * 9.2, pts[k][1], pts[k][0], s * 9.2, pts[k + 1][1], pts[k + 1][0]);
      for (let z = -30; z <= 30; z += 5) cables.push(s * 9.2, 1 + 28 * (z / 35) ** 2, z, s * 9.2, 0.5, z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
    this.scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xdadde2 })));
    this.rect(-8, -60, 8, 60, '#9a9a9a');
  }

  /* ---------- quarteirões ---------- */
  blocks() {
    const special = { '-30,-120': 'police', '30,-120': 'hospital', '30,-180': 'gun', '-90,-120': 'gas', '90,180': 'gas', '-30,120': 'garage', '-30,-180': 'plaza' };
    for (const cx of BLOCKX) for (const cz of BLOCKZ) {
      const sp = special[cx + ',' + cz], row = BLOCKZ.indexOf(cz) % 4, north = cz < 0;
      const kind = sp || (north ? (row < 2 ? 'res' : 'com') : row < 2 ? 'ind' : row === 2 ? 'slum' : 'beach');
      const slabMat = { ind: this.M.conc, slum: this.M.dirt, beach: this.M.sand, plaza: this.M.grass }[kind] || this.M.side;
      this.box(cx, cz, 46, 46, 0.25, slabMat, { cast: false }); this.rect(cx - 23, cz - 23, cx + 23, cz + 23, kind === 'beach' ? '#e6d6a4' : kind === 'plaza' ? '#5d9b48' : '#a9a9a2');
      for (const [ox, oz] of [[21.5, 0], [-21.5, 0], [0, 21.5], [0, -21.5]]) this.lamps.push([cx + ox, cz + oz]);
      this['b_' + kind](cx, cz);
    }
  }
  house(x, z) {
    const w = rand(11, 14), d = rand(10, 13), h = rand(4, 6), rh = rand(2.2, 3.2);
    this.bld(x, z, w, d, h, pick(HOUSE), { map: '#c9b8a0' });
    const r = new THREE.Mesh(this.roofG, this.S(pick([0x8a3b2b, 0x5a4a3a, 0x3d4a5a]))); r.scale.set(w / Math.SQRT2, rh, d / Math.SQRT2); r.position.set(x, 0.25 + h + rh / 2, z); r.castShadow = true; r.matrixAutoUpdate = false; r.updateMatrix(); this.scene.add(r);
  }
  b_res(cx, cz) {
    this.box(cx, cz, 40, 40, 0.04, this.M.grass, { y: 0.25, cast: false });
    if (Math.random() < 0.3) for (const s of [-1, 1]) this.bld(cx + s * 10, cz, 16, 36, rand(11, 17), pick(HOUSE));
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) { this.house(cx + sx * 10, cz + sz * 10); this.trees.push([cx + sx * 18, cz + sz * 18]); }
  }
  b_com(cx, cz) {
    const lay = pick([1, 2, 4]);
    const cells = lay === 1 ? [[0, 0, 34, 34]] : lay === 2 ? [[-10, 0, 16, 34], [10, 0, 16, 34]] : [[-10, -10, 16, 16], [10, -10, 16, 16], [-10, 10, 16, 16], [10, 10, 16, 16]];
    for (const [ox, oz, w, d] of cells) {
      const h = rand(14, 62); this.bld(cx + ox, cz + oz, w, d, h, pick(PAL), { map: '#6f7b8a' });
      this.box(cx + ox, cz + oz, w * 0.4, d * 0.4, 1.6, this.M.conc, { y: 0.25 + h });
      if (Math.random() < 0.5) this.box(cx + ox, cz + oz, 0.4, 0.4, 8, this.M.rail, { y: 0.25 + h + 1.6 });
    }
  }
  b_ind(cx, cz) {
    const m = this.S(pick([0x7b8794, 0x9a8f7d, 0x6e8b74]));
    this.box(cx, cz - 10, 34, 20, 12, m, { y: 0.25, solid: true }); this.rect(cx - 17, cz - 20, cx + 17, cz, '#787878');
    for (let i = 0; i < 5; i++) this.box(cx - 15 + i * 7, cz + 14, 6, 2.5, 2.6, this.S(pick([0xb5332e, 0x2f6db5, 0xd9a21b, 0x2e8b57, 0x888888])), { y: 0.25, solid: true });
    for (const s of [-1, 1]) this.cyl(cx + s * 10, cz + 4, 4, 10, this.S(0xcfd3d6), 0.25);
    this.cyl(cx + 15, cz - 18, 1.2, 22, this.M.conc, 0.25);
  }
  b_slum(cx, cz) {
    for (let i = 0; i < 9; i++) {
      const x = cx - 14 + (i % 3) * 14 + rand(-3, 3), z = cz - 14 + Math.floor(i / 3) * 14 + rand(-3, 3), w = rand(5, 8), d = rand(5, 8), h = rand(2.8, 4.2);
      this.box(x, z, w, d, h, this.S(pick([0xa65a3a, 0x7d8c96, 0xc9a24b, 0x6a8f6a, 0xb86a6a])), { y: 0.25, solid: true }); this.rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, '#8a6a5a');
    }
  }
  b_beach(cx, cz) {
    for (let i = 0; i < 7; i++) this.palms.push([cx + rand(-19, 19), cz + rand(-19, 19)]);
    for (const s of [-1, 1]) { this.box(cx + s * 10, cz - 6, 7, 6, 3.5, this.S(0xf4e3b5), { y: 0.25, solid: true }); const r = new THREE.Mesh(this.roofG, this.M.red); r.scale.set(5.5, 2, 4.8); r.position.set(cx + s * 10, 0.25 + 3.5 + 1, cz - 6); r.castShadow = true; this.scene.add(r); }
    for (let i = 0; i < 4; i++) { const u = new THREE.Mesh(new THREE.ConeGeometry(2, 0.8, 8), this.S(i % 2 ? 0xffffff : 0xe74c3c)); u.position.set(cx - 14 + i * 9, 2.6, cz + 12); u.castShadow = true; this.scene.add(u); this.box(cx - 14 + i * 9, cz + 12, 0.15, 0.15, 2.4, this.M.wood, { y: 0.25 }); }
  }
  b_plaza(cx, cz) {
    this.cyl(cx, cz, 4, 0.8, this.S(0x9fb4c8), 0.25); for (let i = 0; i < 8; i++) this.trees.push([cx + Math.cos(i * 0.785) * 15, cz + Math.sin(i * 0.785) * 15]);
  }
  b_police(cx, cz) {
    this.bld(cx, cz, 26, 26, 14, 0x3c5a9a, { map: '#3c5a9a' }); this.box(cx + 13.1, cz, 0.3, 4, 3.2, this.M.dark, { y: 0.25 });
    this.sign('POLÍCIA', 8, 2, cx + 13.2, 6, cz, Math.PI / 2); this.box(cx, cz, 6, 6, 1.5, this.M.red, { y: 14.25 });
    this.addPad({ x: cx + 18, z: cz, r: 3, kind: 'door', label: 'Entrar na Delegacia', onUse: (g) => g.enterInterior('police') }); this.exits.police = { x: cx + 18, z: cz };
  }
  b_hospital(cx, cz) {
    this.bld(cx, cz, 26, 26, 16, 0xf0f4f7, { map: '#e8eef2' }); this.box(cx - 12.9, cz, 0.3, 4, 3.2, this.M.dark, { y: 0.25 });
    this.sign('HOSPITAL', 8, 2, cx - 13.2, 6, cz, -Math.PI / 2, '#b32020'); this.box(cx, cz, 7, 2, 0.4, this.M.red, { y: 16.3 }); this.box(cx, cz, 2, 7, 0.4, this.M.red, { y: 16.3 });
    this.addPad({ x: cx - 18, z: cz, r: 3, kind: 'door', label: 'Entrar no Hospital', onUse: (g) => g.enterInterior('hospital') }); this.exits.hospital = { x: cx - 18, z: cz };
  }
  b_gun(cx, cz) {
    this.bld(cx - 1, cz, 24, 18, 6, 0xd9822b, { map: '#d9822b' }); this.sign('ARMAS & CIA', 9, 2, cx - 13.2, 4.5, cz, -Math.PI / 2, '#8a3b00');
    this.addPad({ x: cx - 18, z: cz, r: 3, kind: 'shop', label: 'Loja de Armas', onUse: (g) => g.openShop('gun') });
  }
  b_garage(cx, cz) {
    this.bld(cx, cz, 26, 20, 7, 0x555a63, { map: '#555a63' }); this.sign('OFICINA', 8, 2, cx + 13.2, 5, cz, Math.PI / 2, '#333');
    this.addPad({ x: cx + 22, z: cz, r: 7, kind: 'garage', label: 'Oficina', onUse: (g) => g.openShop('garage') });
  }
  b_gas(cx, cz) {
    this.bld(cx + 10, cz - 12, 14, 8, 4, 0xe8e8e0, { map: '#e8e8e0' }); this.box(cx - 4, cz + 8, 22, 12, 0.6, this.S(0xdd2222), { y: 5.5 });
    for (const x of [-12, 4]) for (const z of [3, 13]) this.box(cx + x, cz + z, 0.5, 0.5, 5.5, this.M.rail, { y: 0.25 });
    for (const x of [-8, 0]) this.box(cx + x, cz + 8, 1, 2, 1.6, this.M.red, { y: 0.25, solid: true });
    this.addPad({ x: cx + 20.5, z: cz - 12, r: 3, kind: 'shop', label: 'Conveniência', onUse: (g) => g.openShop('store') });
  }

  /* ---------- mobiliário urbano: postes, semáforos, árvores ---------- */
  furniture() {
    const M = this.M;
    this.instanced(this.cylG, this.S(0x555a60), this.lamps, (d, [x, z]) => { d.position.set(x, 3.3, z); d.scale.set(0.14, 6.6, 0.14); }, true);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
    this.instanced(new THREE.SphereGeometry(0.45, 8, 6), this.lampMat, this.lamps, (d, [x, z]) => { d.position.set(x, 6.7, z); d.scale.set(1, 1, 1); });
    this.poolMat = new THREE.MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.instanced(new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2), this.poolMat, this.lamps, (d, [x, z]) => { d.position.set(x, 0.3, z); d.scale.set(1, 1, 1); });
    // semáforos
    const tl = []; for (let i = 0; i < 9; i++) for (let j = 0; j < 10; j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) tl.push([COLX[i] + sx * 8.3, ROWZ[j] + sz * 8.3, sx * sz > 0 ? 'z' : 'x']);
    this.tl = tl; this.instanced(th
