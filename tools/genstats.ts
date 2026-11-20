// Generator sweep: every habitat × N seeds through the de-novo generator (no meshes) — failures, retries, diversity.
//   npx esbuild tools/genstats.ts --bundle --platform=node --format=cjs --outfile=/tmp/rt/genstats.cjs && node /tmp/rt/genstats.cjs 300
import { generate } from '../src/gen/generate';
import { HABITATS } from '../src/gen/habitats';
const N = +(process.argv[2] ?? 200);
let fail = 0, retried = 0, total = 0;
const t0 = Date.now();
for (const H of HABITATS) {
  const plans: Record<string, number> = {}, tails: Record<string, number> = {}, sig = new Set<string>();
  let dMin = 9, dMax = 0;
  for (let s = 0; s < N; s++) {
    total++;
    try {
      const g = generate(H.id, s * 7919 + 13, { novelty: 0.3 + 0.7 * ((s % 10) / 9) });
      const sp = g.species;
      if (!/0$/.test(sp.id)) retried++;
      plans[g.plan ?? '?'] = (plans[g.plan ?? '?'] ?? 0) + 1;
      tails[sp.fins.caudal.type] = (tails[sp.fins.caudal.type] ?? 0) + 1;
      dMin = Math.min(dMin, sp.body.D); dMax = Math.max(dMax, sp.body.D);
      sig.add(`${g.plan}|${g.niche}|${sp.fins.caudal.type}|${(sp.fins.dorsal ?? []).map((d) => d.shape).join('+')}|${(sp.fins.anal ?? []).length}|${sp.fins.pel?.shape ?? '-'}|${Math.round(sp.body.D * 10)}|${sp.mouth.teeth}`);
    } catch (e) { fail++; if (fail < 6) console.log('FAIL', H.id, s, (e as Error).message.slice(0, 100)); }
  }
  console.log(H.id.padEnd(9), `distinct architectures ${sig.size}/${N}`, `depth ${dMin.toFixed(2)}–${dMax.toFixed(2)}`, Object.entries(plans).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '), '| tails', Object.keys(tails).length);
}
console.log(`total ${total} · failed ${fail} · needed a retry ${retried} · ${((Date.now() - t0) / total).toFixed(1)} ms/fish`);
