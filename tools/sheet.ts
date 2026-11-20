// Offline contact-sheet renderer shared by the QA tools: builds fishes with the real engine and
// software-rasterises the actual meshes (lateral + dorsal view, skin texture included) into PNGs.
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import type { Species } from '../src/engine/types';
import { buildFish } from '../src/engine/build';
(globalThis as any).document = { createElement: () => createCanvas(4, 4) };

export interface Tile { sp: Species; label: string; sub?: string }
const TW = 430, LH = 232, DH = 92, TH = LH + DH, LAB = 30;
const texCache = new Map<any, { w: number; h: number; d: Uint8ClampedArray }>();
const texData = (tex: THREE.Texture) => {
  const im: any = tex.image;
  let t = texCache.get(im);
  if (!t) { const d = im.getContext('2d').getImageData(0, 0, im.width, im.height); t = { w: im.width, h: im.height, d: d.data }; texCache.set(im, t); }
  return t;
};
const hex = (c: string) => { const k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255]; };

function tile(sp: Species, bg: [number, number, number]) {
  const fb = buildFish(sp, 1);
  const meshes = fb.group.children as THREE.Mesh[];
  const rgb = new Float32Array(TW * TH * 3);
  for (let i = 0; i < TW * TH; i++) { const y = Math.floor(i / TW); const g = y < LH ? 1 : 0.8; rgb[i * 3] = bg[0] * g; rgb[i * 3 + 1] = bg[1] * g; rgb[i * 3 + 2] = bg[2] * g; }
  const zb = new Float32Array(TW * TH).fill(-1e9);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  let nan = 0;
  for (const m of meshes) {
    const P = m.geometry.getAttribute('position'), o = m.position;
    for (let i = 0; i < P.count; i++) {
      const v = [P.getX(i) + o.x, P.getY(i) + o.y, P.getZ(i) + o.z];
      if (!Number.isFinite(v[0] + v[1] + v[2])) { nan++; continue; }
      for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
    }
  }
  const flat = sp.plan === 'flatR' || sp.plan === 'flatL';
  // flatfishes are lofted upright and laid on their side by a group rotation: show them the way the engine does
  const k = Math.min((TW - 14) / (mx[0] - mn[0]), (LH - 10) / (mx[1] - mn[1]));
  const xc = (mn[0] + mx[0]) / 2, yc = (mn[1] + mx[1]) / 2;
  const light = new THREE.Vector3(0.25, 0.55, 0.8).normalize();
  const views = [
    { y0: 0, h: LH, pr: (x: number, y: number, z: number) => [TW / 2 + (x - xc) * k, LH / 2 - (y - yc) * k, z], l: light, vz: 2 },
    { y0: LH, h: DH, pr: (x: number, y: number, z: number) => [TW / 2 + (x - xc) * k, LH + DH / 2 + z * k, y], l: new THREE.Vector3(0.25, 0.8, 0.55).normalize(), vz: 1 },
  ];
  void flat;
  for (const pass of [0, 1]) for (const m of meshes) {
    const mat = m.material as any;
    const fin = m.renderOrder === 4 && mat.transparent;
    if ((pass === 1) !== fin) continue;
    let mode = 0, col = [200, 200, 200], alpha = 1;
    if (fin) { mode = 1; const lk = (mat.userData?.finColor as string | undefined); col = hex(lk ?? (mat.map ? sp.fins.color : (sp.fronds?.c ?? sp.fins.color))); alpha = 0.62; }
    else if (mat.map) mode = 2;
    else if (mat.transparent) continue;
    else { const c = mat.emissive && mat.emissiveIntensity > 1 ? mat.emissive : mat.color; col = [c.r * 255, c.g * 255, c.b * 255]; }
    const tx = mode === 2 ? texData(mat.map) : null;
    const g = m.geometry, P = g.getAttribute('position'), Nn = g.getAttribute('normal'), U = g.getAttribute('uv'), I = g.getIndex();
    const o = m.position, n = P.count;
    for (const vw of views) {
      const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n), sh = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const q = vw.pr(P.getX(i) + o.x, P.getY(i) + o.y, P.getZ(i) + o.z);
        sx[i] = q[0]; sy[i] = q[1]; sz[i] = q[2];
        let nx = Nn ? Nn.getX(i) : 0, ny = Nn ? Nn.getY(i) : 0, nz = Nn ? Nn.getZ(i) : 1;
        if ((vw.vz === 2 ? nz : ny) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        sh[i] = 0.4 + 0.62 * Math.max(0, nx * vw.l.x + ny * vw.l.y + nz * vw.l.z);
      }
      const nt = I ? I.count / 3 : n / 3;
      for (let t = 0; t < nt; t++) {
        const a = I ? I.getX(t * 3) : t * 3, b = I ? I.getX(t * 3 + 1) : t * 3 + 1, c = I ? I.getX(t * 3 + 2) : t * 3 + 2;
        const ax = sx[a], ay = sy[a], bx = sx[b], by = sy[b], cx = sx[c], cy = sy[c];
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (!(Math.abs(area) > 1e-9)) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(TW - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(vw.y0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(vw.y0 + vw.h - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c], id = y * TW + x;
          if (z <= zb[id] - (fin ? 1e-4 : 0)) continue;
          const s = w0 * sh[a] + w1 * sh[b] + w2 * sh[c];
          let r = col[0], gg = col[1], bb = col[2];
          if (tx && U) {
            const u = w0 * U.getX(a) + w1 * U.getX(b) + w2 * U.getX(c), v = w0 * U.getY(a) + w1 * U.getY(b) + w2 * U.getY(c);
            const ix = Math.min(tx.w - 1, Math.max(0, Math.floor(u * tx.w))), iy = Math.min(tx.h - 1, Math.max(0, Math.floor((1 - v) * tx.h)));
            const q = (iy * tx.w + ix) * 4; r = tx.d[q]; gg = tx.d[q + 1]; bb = tx.d[q + 2];
          }
          if (fin) { rgb[id * 3] += (r * s - rgb[id * 3]) * alpha; rgb[id * 3 + 1] += (gg * s - rgb[id * 3 + 1]) * alpha; rgb[id * 3 + 2] += (bb * s - rgb[id * 3 + 2]) * alpha; }
          else { zb[id] = z; rgb[id * 3] = r * s; rgb[id * 3 + 1] = gg * s; rgb[id * 3 + 2] = bb * s; }
        }
      }
    }
  }
  const e = sp.eye, md = fb.model, off = meshes[0].position;
  const out = new Uint8ClampedArray(TW * TH * 4);
  for (let i = 0; i < TW * TH; i++) { out[i * 4] = rgb[i * 3]; out[i * 4 + 1] = rgb[i * 3 + 1]; out[i * 4 + 2] = rgb[i * 3 + 2]; out[i * 4 + 3] = 255; }
  let eye: null | { x: number; y: number; r: number; c: string } = null;
  if (e.d > 0 && (sp.plan === 'fish' || sp.plan.startsWith('flat'))) {
    const p = md.attach(e.s, md.eyeYn, 1).p;
    eye = { x: TW / 2 + (p.x + off.x - xc) * k, y: LH / 2 - (p.y + off.y - yc) * k, r: (e.d / 2) * md.L * k, c: e.iris };
  }
  fb.dispose(); texCache.clear();
  return { out, eye, nan };
}

/** render tiles into `${prefix}_N.png` pages; returns the file names written */
export function renderSheets(list: Tile[], prefix: string, cols = 3, rows = 4, bg: [number, number, number] = [10, 44, 62]): string[] {
  const PER = cols * rows, files: string[] = [];
  for (let pg = 0; pg * PER < list.length; pg++) {
    const part = list.slice(pg * PER, pg * PER + PER);
    const nr = Math.ceil(part.length / cols);
    const cv = createCanvas(cols * TW, nr * (TH + LAB));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#061820'; ctx.fillRect(0, 0, cv.width, cv.height);
    part.forEach((t0, i) => {
      const sp = t0.sp;
      const ox = (i % cols) * TW, oy = Math.floor(i / cols) * (TH + LAB);
      try {
        const t = tile(sp, bg);
        const im = ctx.createImageData(TW, TH); im.data.set(t.out); ctx.putImageData(im, ox, oy + LAB);
        if (t.eye) {
          ctx.fillStyle = t.eye.c; ctx.beginPath(); ctx.arc(ox + t.eye.x, oy + LAB + t.eye.y, t.eye.r, 0, 7); ctx.fill();
          ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.arc(ox + t.eye.x, oy + LAB + t.eye.y, t.eye.r * 0.55, 0, 7); ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox + t.eye.x, oy + LAB + t.eye.y, t.eye.r, 0, 7); ctx.stroke();
        }
        if (t.nan) { ctx.fillStyle = '#f44'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(`NaN x${t.nan}`, ox + 6, oy + LAB + 18); }
      } catch (err) {
        ctx.fillStyle = '#f44'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('THROW ' + (err as Error).message.slice(0, 44), ox + 6, oy + LAB + 40);
        console.log('ERR', sp.id, (err as Error).message);
      }
      ctx.fillStyle = '#9fe'; ctx.font = '13px sans-serif'; ctx.fillText(t0.label.slice(0, 62), ox + 4, oy + 12);
      ctx.fillStyle = '#7ab'; ctx.font = '11px sans-serif'; ctx.fillText((t0.sub ?? '').slice(0, 78), ox + 4, oy + 25);
      ctx.strokeStyle = '#123'; ctx.strokeRect(ox + 0.5, oy + 0.5, TW, TH + LAB);
    });
    const f = `${prefix}_${pg}.png`;
    writeFileSync(f, cv.toBuffer('image/png'));
    files.push(f);
  }
  return files;
}
