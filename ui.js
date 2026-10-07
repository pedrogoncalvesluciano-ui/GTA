import { WEAPONS } from './player.js';

const $ = (id) => document.getElementById(id);
const OX = 320, OZ = 380; // origem do mapa pré-renderizado (1 px = 1 unidade)

export class UI {
  constructor(g) {
    this.g = g; this.mini = $('minimap').getContext('2d'); this.big = $('bigmap'); this.bigCtx = this.big.getContext('2d'); this.bigOpen = false; this.shopOpen = false;
    this.stars = $('stars'); this.bannerT = 0; this.prompt = $('prompt');
    $('shopClose').onclick = () => this.closeShop();
    this.buildMap();
  }

  buildMap() { // pré-renderiza o mapa inteiro uma única vez
    const c = document.createElement('canvas'); c.width = 640; c.height = 760; const x = c.getContext('2d');
    for (const [x0, z0, x1, z1, col] of this.g.world.mapRects) { x.fillStyle = col; x.fillRect(x0 + OX, z0 + OZ, x1 - x0, z1 - z0); }
    this.map = c;
  }

  notify(msg, type = '') { const d = document.createElement('div'); d.className = type; d.textContent = msg; $('notify').appendChild(d); setTimeout(() => d.remove(), 4200); while ($('notify').children.length > 5) $('notify').firstChild.remove(); }
  banner(text, t = 2) { const b = $('banner'); b.textContent = text; b.classList.add('show'); clearTimeout(this.bt); this.bt = setTimeout(() => b.classList.remove('show'), t * 1000); }
  flash() { const e = $('dmgflash'); e.style.transition = 'none'; e.style.opacity = 0.6; requestAnimationFrame(() => { e.style.transition = 'opacity .5s'; e.style.opacity = 0; }); }
  setPrompt(t) { this.prompt.style.display = t ? 'block' : 'none'; if (t) this.prompt.textContent = t; }
  setMission(title, text, time) {
    const m = $('mission'); if (!title) { m.style.display = 'none'; return; }
    m.style.display = 'block'; $('mTitle').textContent = title; $('mText').textContent = text; $('mTime').textContent = time ? 'Tempo: ' + Math.ceil(time) + 's' : '';
  }
  showWasted(t) { const w = $('wasted'); w.textContent = t; w.style.display = 'flex'; }
  hideWasted() { $('wasted').style.display = 'none'; }
  transition(cb) { const f = $('fade'); f.style.opacity = 1; setTimeout(() => { cb(); f.style.opacity = 0; }, 260); }

  /* ---- loja ---- */
  openShop(title, items) {
    const g = this.g; this.shopOpen = true; g.paused = true; $('shopTitle').textContent = title; const box = $('shopItems'); box.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button'); b.innerHTML = `<span>${it.label}</span><b>$${it.price}</b>`;
      b.onclick = () => { if (g.player.money < it.price) return this.notify('Dinheiro insuficiente.', 'bad'); if (it.action(g) !== false) { g.player.money -= it.price; this.notify('Comprado: ' + it.label, 'good'); } };
      box.appendChild(b);
    }
    $('shop').style.display = 'block';
  }
  closeShop() { this.shopOpen = false; this.g.paused = false; $('shop').style.display = 'none'; }
  toggleBig() { this.bigOpen = !this.bigOpen; this.big.style.display = this.bigOpen ? 'block' : 'none'; }

  /* ---- loop ---- */
  update() {
    const g = this.g, p = g.player, v = p.vehicle;
    $('hp').style.width = p.hp + '%'; $('armor').style.width = p.armor + '%'; $('money').textContent = '$' + Math.floor(p.money);
    const w = WEAPONS[p.weapon]; $('weapon').textContent = w.melee ? w.name : `${w.name} · ${p.ammo[p.weapon]}`;
    const h = Math.floor(g.time), m = Math.floor((g.time % 1) * 60); $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    let s = ''; for (let i = 1; i <= 5; i++) s += `<span class="${i <= g.police.stars ? 'on' : ''}">★</span>`; this.stars.innerHTML = s; this.stars.className = g.police.units.some((u) => u.cop && u.cop.chasing) ? 'chase' : '';
    $('speed').textContent = v ? Math.round(Math.abs(v.speed) * 3.6) + ' km/h' : '';
    this.drawMini(); if (this.bigOpen) this.drawBig();
  }

  blips(ctx, tx, tz, scale) { // desenha entidades usando a função de transformação tx/tz
    const g = this.g;
    for (const n of g.peds.list) if (!n.dead && n.root.visible) { ctx.fillStyle = '#ccc'; ctx.fillRect(tx(n.x) - 1, tz(n.z) - 1, 2, 2); }
    for (const v of g.vehicles.list) {
      if (v.dead) continue; const cop = v.cop && v.cop.chasing; ctx.fillStyle = cop ? (Math.floor(performance.now() / 200) % 2 ? '#ff3b3b' : '#3b7bff') : v === g.player.vehicle ? '#ffd23f' : '#9ad';
      ctx.fillRect(tx(v.x) - 2.5, tz(v.z) - 2.5, 5, 5);
    }
  }
  marker(ctx, x, z, color, label, R, cx, cy, clampTo) {
    let dx = x - cx, dz = z - cy; const d = Math.hypot(dx, dz); if (clampTo && d > clampTo) { dx = (dx / d) * clampTo; dz = (dz / d) * clampTo; }
    ctx.beginPath(); ctx.arc(R + dx, R + dz, 6, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    if (label) { ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, R + dx, R + dz + 3); }
  }
  playerArrow(ctx, x, y, h, s = 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - h); ctx.beginPath(); ctx.moveTo(0, -7 * s); ctx.lineTo(5 * s, 6 * s); ctx.lineTo(-5 * s, 6 * s); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }

  drawMini() {
    const g = this.g, c = this.mini, p = g.player, R = 95, z = 1.2, span = 190 / z;
    c.clearRect(0, 0, 190, 190); c.fillStyle = '#0d2a44'; c.fillRect(0, 0, 190, 190);
    const px = p.interior ? 0 : p.x, pz = p.interior ? -60 : p.z;
    c.drawImage(this.map, px + OX - span / 2, pz + OZ - span / 2, span, span, 0, 0, 190, 190);
    this.blips(c, (x) => (x - px) * z + R, (zz) => (zz - pz) * z + R, z);
    for (const d of g.missions.defs) if (d.marker && d.marker.visible) this.marker(c, (d.start.x - px) * z + R, (d.start.z - pz) * z + R, d.type === 'main' ? '#ffd23f' : '#4fc3ff', d.type === 'main' ? 'M' : 'S', R, R, R, R - 8);
    const wp = g.missions.waypoint; if (wp) this.marker(c, (wp.x - px) * z + R, (wp.z - pz) * z + R, '#ff3b3b', '', R, R, R, R - 8);
    this.playerArrow(c, R, R, p.heading);
  }
  drawBig() {
    const g = this.g, c = this.bigCtx, p = g.player; c.clearRect(0, 0, 640, 760); c.drawImage(this.map, 0, 0);
    this.blips(c, (x) => x + OX, (zz) => zz + OZ, 1);
    c.font = 'bold 22px sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('ILHA NORTE', OX, 40); c.fillText('ILHA SUL', OX, 740);
    for (const d of g.missions.defs) if (d.marker && d.marker.visible) this.marker(c, d.start.x + OX, d.start.z + OZ, d.type === 'main' ? '#ffd23f' : '#4fc3ff', d.type === 'main' ? 'M' : 'S', 0, 0, 0, 0);
    const wp = g.missions.waypoint; if (wp) this.marker(c, wp.x + OX, wp.z + OZ, '#ff3b3b', '', 0, 0, 0, 0);
    if (!p.interior) this.playerArrow(c, p.x + OX, p.z + OZ, p.heading, 1.8);
  }
}
