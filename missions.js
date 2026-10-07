import { makeMarker } from './utils.js';

/* Missões orientadas a dados: cada passo tem texto, posição do waypoint e uma função check(). */
const goto = (text, x, z, r, veh = false) => ({ text, pos: () => ({ x, z }), check: (g) => (!veh || g.player.vehicle) && Math.hypot(g.player.x - x, g.player.z - z) < r });

export class MissionManager {
  constructor(g) {
    this.g = g; this.active = null; this.done = new Set(); this.cool = {}; this.waypoint = null; this.defs = this.build();
    for (const d of this.defs) if (d.start) { d.marker = makeMarker(d.type === 'main' ? 0xffd23f : 0x4fc3ff, 3.2, 30); d.marker.position.set(d.start.x, 0, d.start.z); g.scene.add(d.marker); }
    this.wp = makeMarker(0xff3b3b, 5, 80); this.wp.visible = false; g.scene.add(this.wp);
  }

  build() {
    const self = this; let car = null;
    return [
      { id: 'm1', type: 'main', title: 'Missão 1 — Primeiro Serviço', start: { x: -9.5, z: -108 }, reward: 300, chain: 'm2',
        steps: [
          goto('Vá até o beco marcado na Rua 3 (a pé ou de carro).', 150, -210, 12),
          { text: 'Roube o esportivo vermelho estacionado!', init: (g) => { car = g.vehicles.spawn('sport', 150, -206.4, Math.PI / 2, 0xcc1111, { keep: true }); }, pos: () => car && { x: car.x, z: car.z }, check: (g) => g.player.vehicle === car, done: (g) => g.police.setWanted(2) },
        ] },
      { id: 'm2', type: 'main', title: 'Missão 2 — Fuga pela Ponte', reward: 1500, onStart: (g) => g.police.setWanted(3),
        steps: [
          goto('A polícia te viu! Fuja para a ponte central.', 0, -72, 14, true),
          goto('Atravesse a ponte até a Ilha Sul!', 0, 100, 14, true),
          { text: 'Despiste a polícia: saia de vista ou use a Oficina (repintura).', pos: () => ({ x: -8, z: 120 }), check: (g) => g.police.stars === 0 },
        ] },
      { id: 's1', type: 'side', title: 'Entrega Express', start: { x: -9.5, z: -160 }, reward: 600, time: 120, steps: [goto('Pegue um veículo e leve a encomenda ao cruzamento da Ilha Sul.', 60, 150, 10, true)] },
      { id: 's2', type: 'side', title: 'Corrida de Rua', start: { x: 9.5, z: -75 }, reward: 800, time: 85,
        onStart: (g) => { g.vehicles.spawn('sport', 3.6, -100, 0, 0x2a7de1, { keep: true }); },
        steps: [goto('Checkpoint 1/5', -180, -90, 14, true), goto('Checkpoint 2/5', -180, -270, 14, true), goto('Checkpoint 3/5', 120, -270, 14, true), goto('Checkpoint 4/5', 120, -90, 14, true), goto('Linha de chegada!', 0, -90, 14, true)] },
    ];
  }

  start(id) {
    const d = this.defs.find((m) => m.id === id), g = this.g; if (!d) return;
    this.active = { def: d, idx: 0, time: d.time || 0, inited: false }; d.onStart && d.onStart(g);
    g.ui.banner(d.title, 2.2); g.ui.notify('Missão iniciada: ' + d.title);
  }
  fail(msg) { if (!this.active) return; this.g.ui.notify('Missão falhou: ' + msg, 'bad'); this.active = null; this.hide(); }
  hide() { this.waypoint = null; this.wp.visible = false; this.g.ui.setMission(null); }

  update(dt) {
    const g = this.g, p = g.player;
    for (const d of this.defs) {
      if (!d.marker) continue; const avail = !this.active && !this.done.has(d.id) && !(this.cool[d.id] > 0); d.marker.visible = avail && !p.interior;
      if (this.cool[d.id] > 0) this.cool[d.id] -= dt;
      if (avail && !p.dead && !p.interior && Math.hypot(p.x - d.start.x, p.z - d.start.z) < 3.4) this.start(d.id);
    }
    const a = this.active; if (!a) { this.wp.visible = false; return; }
    const step = a.def.steps[a.idx];
    if (!a.inited) { a.inited = true; step.init && step.init(g); }
    const pos = step.pos && step.pos(); this.waypoint = pos || null;
    if (pos) { this.wp.visible = true; this.wp.position.set(pos.x, 0, pos.z); this.wp.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 200) * 0.08); } else this.wp.visible = false;
    if (a.def.time) { a.time -= dt; if (a.time <= 0) return this.fail('tempo esgotado'); }
    g.ui.setMission(a.def.title, step.text, a.def.time ? a.time : null);
    if (step.check(g, dt)) {
      step.done && step.done(g); a.idx++; a.inited = false;
      if (a.idx >= a.def.steps.length) {
        p.money += a.def.reward; g.ui.banner('MISSÃO COMPLETA', 2.5); g.ui.notify(`+$${a.def.reward} — ${a.def.title}`, 'good');
        if (a.def.type === 'main') this.done.add(a.def.id); else this.cool[a.def.id] = 60;
        this.active = null; this.hide(); if (a.def.chain) this.start(a.def.chain);
      }
    }
  }
}
