// Multi-angle offline viewer: software-rasterises the real engine meshes from any yaw/pitch, whole fish or head close-up.
//   npx esbuild tools/view.ts --bundle --platform=node --format=cjs --external:@napi-rs/canvas --outfile=/tmp/rt/view.cjs
//   node /tmp/rt/view.cjs atlas /tmp/rt/out.png whale-shark longhorn-cowfish
//   node /tmp/rt/view.cjs gen /tmp/rt/reef.png reef 0 12        (habitat, first seed, count)
//   node /tmp/rt/view.cjs audit 0 300
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import type { Species } from '../src/engine/types';
import { buildFish } from '../src/engine/build';
import { SPECIES } from '../src/data/species';
import { generate } from '../src/gen/generate';
import { HABITATS, type HabitatId } from '../src/gen/habitats';
(globalThis as any).document = { createElement: () => createCanvas(4, 4) };

export interface View { yaw: number; pitch: number; head?: boolean; zoom?: number }
const texCache = new Map<any, { w: number; h: number; d: Uint8ClampedArray }>();
const texData = (tex: THREE.Texture) => {
  const im: any = tex.image;
  let t = texCache.get(im);
  if (!t) { if (!im.getContext) { if (!im.data) return null as any; t = { w: im.width, h: im.height, d: im.data }; } else { const d = im.getContext('2d').getImageData(0, 0, im.width, im.height); t = { w: im.width, h: im.height, d: d.data }; } texCache.set(im, t); }
  return t;
};
const hex = (c: string) => { const k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255]; };

export function tile(sp: Species, vw: View, TW: number, TH: number, bg = [10, 44, 62]): Uint8ClampedArray {
  const fb = buildFish(sp, 1);
  const meshes = fb.group.children as THREE.Mesh[];
  const rgb = new Float32Array(TW * TH * 3);
  for (let i = 0; i < TW * TH; i++) { rgb[i * 3] = bg[0]; rgb[i * 3 + 1] = bg[1]; rgb[i * 3 + 2] = bg[2]; }
  const zb = new Float32Array(TW * TH).fill(-1e9);
  const rot = new THREE.Matrix4().makeRotationX(vw.pitch * Math.PI / 180).multiply(new THREE.Matrix4().makeRotationY(vw.yaw * Math.PI / 180));
  const R3 = new THREE.Matrix3().setFromMatrix4(rot);
  const snout = fb.model.attach(0.0, 0, 1).p.clone().add(meshes[0].position);
  const tailP = fb.model.attach(0.98, 0, 1).p.clone().add(meshes[0].position);
  const axis = tailP.clone().sub(snout); const Lb = axis.length(); axis.normalize();
  const mn = [1e9, 1e9], mx = [-1e9, -1e9];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const P = m.geometry.getAttribute('position'), o = m.position;
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i) + o.x, P.getY(i) + o.y, P.getZ(i) + o.z);
      if (!Number.isFinite(v.x + v.y + v.z)) continue;
      if (vw.head && v.clone().sub(snout).dot(axis) > Lb * 0.36) continue;
      v.applyMatrix3(R3);
      if (v.x < mn[0]) mn[0] = v.x; if (v.x > mx[0]) mx[0] = v.x; if (v.y < mn[1]) mn[1] = v.y; if (v.y > mx[1]) mx[1] = v.y;
    }
  }
  const k = Math.min((TW - 14) / (mx[0] - mn[0]), (TH - 10) / (mx[1] - mn[1])) * (vw.zoom ?? 1);
  const xc = (mn[0] + mx[0]) / 2, yc = (mn[1] + mx[1]) / 2;
  const light = new THREE.Vector3(0.25, 0.55, 0.8).normalize();
  for (const pass of [0, 1]) for (const m of meshes) {
    const mat = m.material as any;
    const fin = m.renderOrder === 4 && mat.transparent;
    if ((pass === 1) !== fin) continue;
    let col = [200, 200, 200], alpha = 1, mode = 0;
    if (fin) { mode = 1; col = hex(mat.map ? sp.fins.color : (sp.fronds?.c ?? sp.fins.color)); alpha = 0.62; }
    else if (mat.map) mode = 2;
    else if (mat.transparent) continue;
    else { const c = mat.emissive && mat.emissiveIntensity > 1 ? mat.emissive : mat.color; col = [c.r * 255, c.g * 255, c.b * 255]; }
    const tx = mode === 2 ? texData(mat.map) : null;
    const g = m.geometry, P = g.getAttribute('position'), Nn = g.getAttribute('normal'), U = g.getAttribute('uv'), I = g.getIndex();
    const o = m.position, n = P.count;
    const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n), sh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      v.set(P.getX(i) + o.x, P.getY(i) + o.y, P.getZ(i) + o.z).applyMatrix3(R3);
      sx[i] = TW / 2 + (v.x - xc) * k; sy[i] = TH / 2 - (v.y - yc) * k; sz[i] = v.z;
      if (Nn) v.set(Nn.getX(i), Nn.getY(i), Nn.getZ(i)).applyMatrix3(R3); else v.set(0, 0, 1);
      if (v.z < 0) v.multiplyScalar(-1);
      sh[i] = 0.4 + 0.62 * Math.max(0, v.dot(light));
    }
    const nt = I ? I.count / 3 : n / 3;
    for (let t = 0; t < nt; t++) {
      const a = I ? I.getX(t * 3) : t * 3, b = I ? I.getX(t * 3 + 1) : t * 3 + 1, c = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      const ax = sx[a], ay = sy[a], bx = sx[b], by = sy[b], cx = sx[c], cy = sy[c];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (!(Math.abs(area) > 1e-9)) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(TW - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(TH - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c], id = y * TW + x;
        if (z <= zb[id] - (fin ? 1e-4 : 0)) continue;
        const s = w0 * sh[a] + w1 * sh[b] + w2 * sh[c];
        let r = col[0], gg = col[1], bb = col[2];
        if (tx && U) {
          const uu = w0 * U.getX(a) + w1 * U.getX(b) + w2 * U.getX(c), vv = w0 * U.getY(a) + w1 * U.getY(b) + w2 * U.getY(c);
          const ix = Math.min(tx.w - 1, Math.max(0, Math.floor(uu * tx.w))), iy = Math.min(tx.h - 1, Math.max(0, Math.floor((1 - vv) * tx.h)));
          const q = (iy * tx.w + ix) * 4; r = tx.d[q]; gg = tx.d[q + 1]; bb = tx.d[q + 2];
        }
        if (fin) { rgb[id * 3] += (r * s - rgb[id * 3]) * alpha; rgb[id * 3 + 1] += (gg * s - rgb[id * 3 + 1]) * alpha; rgb[id * 3 + 2] += (bb * s - rgb[id * 3 + 2]) * alpha; }
        else { zb[id] = z; rgb[id * 3] = r * s; rgb[id * 3 + 1] = gg * s; rgb[id * 3 + 2] = bb * s; }
      }
    }
  }
  fb.dispose(); texCache.clear();
  const out = new Uint8ClampedArray(TW * TH * 4);
  for (let i = 0; i < TW * TH; i++) { out[i * 4] = rgb[i * 3]; out[i * 4 + 1] = rgb[i * 3 + 1]; out[i * 4 + 2] = rgb[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return out;
}

export function sheet(file: string, rows: { sp: Species; label: string }[], views: View[], TW = 300, TH = 200, cols = 1) {
  const LAB = 14, CW = TW * views.length;
  const cv = createCanvas(CW * cols, Math.ceil(rows.length / cols) * (TH + LAB));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#061820'; ctx.fillRect(0, 0, cv.width, cv.height);
  rows.forEach((r, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (TH + LAB);
    views.forEach((vw, j) => {
      try { const im = ctx.createImageData(TW, TH); im.data.set(tile(r.sp, vw, TW, TH)); ctx.putImageData(im, ox + j * TW, oy + LAB); }
      catch (e) { ctx.fillStyle = '#f44'; ctx.font = '12px sans-serif'; ctx.fillText('THROW ' + (e as Error).message.slice(0, 40), ox + j * TW + 4, oy + LAB + 30); console.log('ERR', r.label, (e as Error).message); }
    });
    ctx.fillStyle = '#9fe'; ctx.font = '11px sans-serif'; ctx.fillText(r.label.slice(0, Math.floor(CW / 6)), ox + 3, oy + 11);
  });
  writeFileSync(file, cv.toBuffer('image/png'));
  console.log('wrote', file);
}

if (require.main === module) {
  const [mode, file, ...a] = process.argv.slice(2);
  if (mode === 'atlas') {
    const rows = a.map((id) => ({ sp: SPECIES.find((s) => s.id === id)!, label: id })).filter((r) => r.sp);
    sheet(file, rows, [{ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0, head: true }, { yaw: -90, pitch: 0, head: true }, { yaw: -40, pitch: 18, head: true }, { yaw: 0, pitch: 90, head: true }], 300, 220);
  } else if (mode === 'gen') {
    const [hab, s0, n, nov] = a;
    const rows = Array.from({ length: +n }, (_, i) => { const g = generate(hab as HabitatId, +s0 + i, { novelty: nov === undefined ? 1 : +nov }); return { sp: g.species, label: `${+s0 + i} ${g.common} · ${g.niche} · ${(g as any).plan ?? g.lineage} · D${(g.species.body.D * 100).toFixed(0)} ${g.species.fins.caudal.type}` }; });
    sheet(file, rows, [{ yaw: 0, pitch: 0 }], 330, 190, 4);
  } else if (mode === 'plans') {
    // forced constructions in fitting habitats: node view.cjs plans out.png 5 reef:globe hadal:tadpole …
    const [s0, ...combos] = a;
    const rows = combos.flatMap((c) => [0, 1].map((i) => { const [hab, plan] = c.split(':'); const g = generate(hab as HabitatId, +s0 + i, { novelty: 0.8, plan: plan as any }); return { sp: g.species, label: `${hab} ${plan} · ${g.common} · ${g.niche} · D${(g.species.body.D * 100).toFixed(0)} ${g.species.fins.caudal.type}` }; }));
    sheet(file, rows, [{ yaw: 0, pitch: 0 }], 330, 190, 4);
  } else if (mode === 'genhead') {
    const [hab, s0, n] = a;
    const rows = Array.from({ length: +n }, (_, i) => { const g = generate(hab as HabitatId, +s0 + i, { novelty: 1 }); return { sp: g.species, label: `${+s0 + i} ${g.common}` }; });
    sheet(file, rows, [{ yaw: 0, pitch: 0 }, { yaw: -40, pitch: 18, head: true }, { yaw: 0, pitch: 90 }], 300, 180, 2);
  } else if (mode === 'audit') {
    const s0 = +file, s1 = +a[0];
    let bad = 0; const hist: Record<string, number> = {};
    for (const H of HABITATS) for (let s = s0; s < s1; s++) {
      if (s === s0) console.log('…', H.id, 'bad so far', bad);
      try {
        const g = generate(H.id, s, { novelty: 1 });
        if (process.env.TRACE) console.log('build', H.id, s, g.plan, g.niche, g.common);
        const key = `${(g as any).plan ?? g.lineage}`; hist[key] = (hist[key] ?? 0) + 1;
        const fb = buildFish(g.species, 1);
        let nan = 0;
        for (const m of fb.group.children as THREE.Mesh[]) { const P = m.geometry.getAttribute('position'); for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) nan++; }
        fb.dispose();
        if (nan) { bad++; console.log('NaN', H.id, s, nan, g.common); }
      } catch (e) { bad++; console.log('THROW', H.id, s, (e as Error).message.slice(0, 90)); }
    }
    console.log('audited', (s1 - s0) * HABITATS.length, 'bad', bad, JSON.stringify(hist));
  }
}
