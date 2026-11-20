// Generator QA: integrity + coherence audit of generated genomes, and contact sheets of what they look like.
//   npx esbuild tools/genqa.ts --bundle --platform=node --format=cjs --external:@napi-rs/canvas --outfile=/tmp/rt/genqa.cjs
//   node /tmp/rt/genqa.cjs audit 0 400         → build seeds [0,400) with the real engine, report problems + diversity
//   node /tmp/rt/genqa.cjs sheet /tmp/rt/out/blind 0 24   → contact sheets of blind seeds [0,24)
//   node /tmp/rt/genqa.cjs hab /tmp/rt/out/reef reef 0.7 0 12
import * as THREE from 'three';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildFish } from '../src/engine/build';
import { BodyModel } from '../src/engine/model';
import type { Species } from '../src/engine/types';
import { blind, generate, type GenFish } from '../src/gen/generate';
import { HABITATS, type HabitatId } from '../src/gen/habitats';
import { renderSheets, type Tile } from './sheet';

/** structural coherence checks on a genome + its built meshes */
export function audit(sp: Species): string[] {
  const bad: string[] = [];
  let md: BodyModel;
  try { md = new BodyModel(sp, 1); } catch (e) { return ['model-throw:' + (e as Error).message]; }
  const e = sp.eye, f = sp.fins, b = sp.body;
  const fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (![b.D, b.P, b.W, sp.HL, sp.lenM, e.d, e.s, e.y, sp.mouth.gape].every(fin)) bad.push('non-finite-genome');
  if (sp.plan === 'fish' && !b.disc) {
    // silhouette sanity
    let neg = 0, maxD = 0;
    for (let i = 1; i <= 200; i++) { const s = i / 200, t = md.top(s), bt = md.bot(s); if (!(t >= 0) || !(bt >= 0)) neg++; maxD = Math.max(maxD, t + bt); }
    if (neg) bad.push('outline-negative');
    if (maxD > 1.05) bad.push('depth>1.05');
    if (maxD < 0.02) bad.push('depth<0.02');
    // eye inside the head
    if (e.d > 0 && e.y < 0.72 && !b.bend) {
      const yc = md.normY(e.s, md.eyeYn);
      if (yc + e.d / 2 > md.top(e.s) * 1.1) bad.push('eye-above-skull');
      if (yc - e.d / 2 < -md.bot(e.s) * 1.02) bad.push('eye-below-head');
      if (e.d > (md.top(e.s) + md.bot(e.s)) * 0.75) bad.push('eye-too-big');
      if (e.s > sp.HL) bad.push('eye-behind-head');
    }
    // mouth inside the head
    if ((sp.mouth.kind ?? 'jaw') === 'jaw' && sp.mouth.gape > 0.004 && !sp.rostrum && !b.snout && md.rictus.s > sp.HL * 1.02 + 0.01) bad.push('rictus-behind-head');
    // fins on the body, ordered, not overlapping
    const med = (arr: typeof f.dorsal, nm: string) => {
      const a = arr ?? [];
      for (let i = 0; i < a.length; i++) {
        const x = a[i];
        if (!(x.s1 > x.s0)) bad.push(`${nm}-degenerate`);
        if (x.s0 < 0 || x.s1 > 1.0001) bad.push(`${nm}-off-body`);
        if (!(x.h > 0) || x.h > 0.75) bad.push(`${nm}-height`);
        if (i && x.s0 < a[i - 1].s1 - 1e-6) bad.push(`${nm}-overlap`);
      }
    };
    med(f.dorsal, 'dorsal'); med(f.anal, 'anal');
    if (f.pec && (f.pec.s < 0 || f.pec.s > 0.95)) bad.push('pec-off-body');
    if (f.pel && (f.pel.s < 0 || f.pel.s > 0.97)) bad.push('pel-off-body');
    if (f.caudal.type !== 'none' && !(f.caudal.span > 0)) bad.push('caudal-span');
  }
  // real geometry
  try {
    const fb = buildFish(sp, 1);
    let nan = 0;
    for (const m of fb.group.children as THREE.Mesh[]) {
      const P = m.geometry.getAttribute('position');
      for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) nan++;
    }
    if (nan) bad.push(`nan-verts:${nan}`);
    if (!Number.isFinite(fb.radius) || fb.radius <= 0) bad.push('bad-radius');
    fb.dispose();
  } catch (err) { bad.push('build-throw:' + (err as Error).message.slice(0, 60)); }
  return bad;
}

const sub = (g: GenFish) => `${g.habitat} · ${g.niche} · ${g.lineage} · nov ${Math.round(g.novelty * 100)}% · D${(g.species.body.D * 100).toFixed(0)} ${g.species.fins.caudal.type}`;
const toTile = (g: GenFish): Tile => ({ sp: g.species, label: `${g.common}`, sub: sub(g) });

if (require.main === module) {
  const [mode, ...a] = process.argv.slice(2);
  if (mode === 'audit') {
    const [s0, s1] = a.map(Number);
    const problems: Record<string, number> = {};
    const hist: Record<string, Record<string, number>> = { caudal: {}, lineage: {}, plan: {}, strategy: {}, niche: {}, dorsalN: {}, depth: {} };
    const bump = (k: string, v: string) => { hist[k][v] = (hist[k][v] ?? 0) + 1; };
    let n = 0, badN = 0; const names = new Set<string>();
    const t0 = Date.now();
    for (let seed = s0; seed < s1; seed++) {
      let g: GenFish;
      try { g = blind(seed); } catch (err) { badN++; problems['gen-throw'] = (problems['gen-throw'] ?? 0) + 1; console.log('GEN THROW', seed, (err as Error).message); continue; }
      const bad = audit(g.species);
      n++;
      if (bad.length) { badN++; for (const b of bad) { const k = b.split(':')[0]; problems[k] = (problems[k] ?? 0) + 1; } if (badN <= 12) console.log('PROBLEM seed', seed, g.common, '|', g.habitat, g.lineage, '|', bad.join(', ')); }
      names.add(g.latin);
      bump('caudal', g.species.fins.caudal.type); bump('lineage', g.lineage); bump('plan', g.species.plan); bump('strategy', String(g.strategy)); bump('niche', g.niche);
      bump('dorsalN', String(g.species.fins.dorsal?.length ?? 0));
      const D = g.species.body.D; bump('depth', D < 0.08 ? 'eel<8' : D < 0.16 ? 'slender<16' : D < 0.26 ? 'fusiform<26' : D < 0.4 ? 'robust<40' : D < 0.6 ? 'deep<60' : 'disc60+');
    }
    console.log(`\naudited ${n} genomes in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${badN} with problems, ${names.size} distinct binomials`);
    console.log('problems:', JSON.stringify(problems));
    for (const k of Object.keys(hist)) console.log(k.padEnd(9), Object.entries(hist[k]).sort((x, y) => y[1] - x[1]).map(([v, c]) => `${v}:${c}`).join('  '));
  } else if (mode === 'sheet') {
    const [prefix, s0, s1] = [a[0], +a[1], +a[2]];
    mkdirSync(dirname(prefix), { recursive: true });
    const list: Tile[] = [];
    for (let seed = s0; seed < s1; seed++) list.push(toTile(blind(seed)));
    console.log(renderSheets(list, prefix).join('\n'));
  } else if (mode === 'hab') {
    const [prefix, hid, nov, s0, s1] = [a[0], a[1] as HabitatId, +a[2], +a[3], +a[4]];
    mkdirSync(dirname(prefix), { recursive: true });
    const list: Tile[] = [];
    for (let seed = s0; seed < s1; seed++) list.push(toTile(generate(hid, seed, { novelty: nov })));
    console.log(renderSheets(list, prefix).join('\n'));
  } else if (mode === 'all') {
    // one fish per habitat at a given novelty
    const [prefix, nov, seed] = [a[0], +a[1], +(a[2] ?? 1)];
    mkdirSync(dirname(prefix), { recursive: true });
    console.log(renderSheets(HABITATS.map((h) => toTile(generate(h.id, seed, { novelty: nov }))), prefix).join('\n'));
  } else console.log('modes: audit | sheet | hab | all');
}
