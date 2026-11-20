// Geometry regression suite: npx tsx tools/anatomy-qa.ts
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { SPECIES } from '../src/data/species';
import { buildFish } from '../src/engine/build';
import { DEG } from '../src/engine/math';
import type { Species } from '../src/engine/types';
import { generate, fromSpecies, cross, migrate, offspring, SPECIES_BY_ID } from '../src/gen/generate';
import { HABITATS } from '../src/gen/habitats';

Object.assign(globalThis, { document: { createElement: () => createCanvas(8, 8) } });
const reef = [generate('reef', 23, { novelty: .65, lineage: 'sharkPelagic' }), generate('reef', 308, { novelty: .65, lineage: 'manta' }),
  generate('reef', 36, { novelty: .65 }), generate('reef', 22, { novelty: .65, lineage: 'tetraodont' }),
  generate('reef', 198, { novelty: .65 }), generate('reef', 101, { novelty: .65, lineage: 'tetraodont' }),
  generate('swamp', 1, { novelty: .65, lineage: 'labyrinth' })];
const manta = fromSpecies(SPECIES_BY_ID['reef-manta-ray']);
const cowfish = fromSpecies(SPECIES_BY_ID['longhorn-cowfish']);
const descendants = [offspring(manta, 82), migrate(manta, 'pelagic', 91, .9), cross(manta, cowfish, 351), offspring(cowfish, 194)];
const sweep = HABITATS.flatMap((h, i) => [0, .35, .65, 1].map((novelty, j) => generate(h.id, i * 359 + j + 7, { novelty })));
const cases: [Species, number][] = [...SPECIES.map((sp): [Species, number] => [sp, 1]), ...[...reef, ...descendants, ...sweep].map((g): [Species, number] => [g.species, g.seed])];
const subset = process.argv[2];
const run = subset === 'focused' ? [...reef, ...descendants].map((g): [Species, number] => [g.species, g.seed]) : subset === 'atlas' ? cases.slice(0, SPECIES.length) : cases;
let tested = 0, jawChecks = 0, pairedChecks = 0, eyeChecks = 0, lobeChecks = 0, hornChecks = 0;
for (const [sp, seed] of run) {
  const fb = buildFish(sp, seed, { paint: false });
  try {
    const { model, uniforms: u } = fb;
    const meshes = fb.group.children as THREE.Mesh[];
    assert.ok(Number.isFinite(fb.radius) && fb.radius > 0);
    for (const { geometry: g } of meshes) {
      const p = g.getAttribute('position');
      for (const a of Object.values(g.attributes)) {
        assert.equal(a.count, p.count);
        assert.ok(a.array.every(Number.isFinite), 'non-finite vertex attribute');
      }
      assert.ok(!g.index || g.index.array.every((i) => i < p.count), 'out-of-range face');
    }
    if (model.hasJaw()) {
      const s = model.rictus.s, phi = model.seamPhi(s);
      const upper = model.poseAt(s, phi, false), lower = model.poseAt(s, phi, true);
      assert.ok(Math.abs(upper.jaw - lower.jaw) < 1e-8, 'jaw hinge splits the rictus');
      assert.deepEqual(upper.plastic, lower.plastic, 'soft motion splits oral corner');
      assert.equal(lower.jut, 0, 'static protrusion separates the closed lips');
      assert.ok(u.uMaxGape.value === model.jawAngle() * DEG);
      const parts = ['lip:upper', 'lip:lower', 'oral:floor', 'oral:palate'];
      assert.ok(parts.every((name) => meshes.some((m) => m.name === name)));
      jawChecks++;
    }
    // Paired fin roots must be pinned, the shells must mirror exactly, and the contact map must be installed.
    for (const key of ['pec', 'pel'] as const) {
      if (!sp.fins[key]) continue;
      const a = meshes.find((m) => m.name === `fin:paired:${key}:R`)?.geometry;
      const b = meshes.find((m) => m.name === `fin:paired:${key}:L`)?.geometry;
      assert.ok(a && b);
      assert.ok(u.uPairMap.value && u.uPairSize.value.z > 0);
      const p = a.getAttribute('position'), n = b.getAttribute('position'), f = a.getAttribute('aFin');
      for (let i = 0; i < p.count; i += 3) {
        if (f.getZ(i) === 0) assert.equal(f.getX(i), 0);
        assert.ok(p.getX(i) === n.getX(i) && p.getY(i) === n.getY(i) && p.getZ(i) === -n.getZ(i));
      }
      pairedChecks++;
    }
    if (sp.eye.d > 0) {
      for (let i = 0; i < 2; i++) {
        const globe = meshes.find((m) => m.name === `eye:globe:${i}`)?.geometry;
        const orbit = meshes.find((m) => m.name === `eye:orbit:${i}`)?.geometry;
        assert.ok(globe && orbit);
        const c = u.uOrbitC.value[i], d = u.uOrbitN.value[i];
        assert.ok(c.w > 0 && d.w > 0);
        const a = orbit.getAttribute('position');
        const C = new THREE.Vector3(c.x,c.y,c.z), A = new THREE.Vector3(d.x,d.y,d.z);
        const v = new THREE.Vector3();
        for (let j = 2 * 73; j < a.count; j += 3) {
          v.fromBufferAttribute(a,j).sub(C).addScaledVector(A,-v.dot(A));
          assert.ok(v.length() >= c.w * 0.91, 'orbit skin enters the iris');
        }
        eyeChecks++;
      }
    }
    if (sp.cephalic) {
      const a = meshes.find((m) => m.name === 'cephalic:R')?.geometry;
      assert.ok(a && meshes.some((m) => m.name === 'cephalic:L'));
      // The two layers converge at the leading tip; there is no thick, open end cap.
      const p = a.getAttribute('position');
      const layer = p.count / 2;
      for (let i = layer - 35; i < layer; i++) {
        assert.ok(Math.hypot(p.getX(i)-p.getX(i+layer), p.getY(i)-p.getY(i+layer), p.getZ(i)-p.getZ(i+layer)) < 1e-6);
      }
      lobeChecks++;
    }
    if (sp.spikes?.length) {
      assert.equal(meshes.filter((m) => m.name === 'horn').length, sp.spikes.reduce((n, s) => n + (s.mirror === false ? 1 : 2), 0));
      hornChecks++;
    }
    tested++;
  } catch (err) {
    console.error('Failed:', sp.id, '(seed', seed + ')');
    throw err;
  } finally { fb.dispose(); }
}
const atlasCount = subset === 'focused' ? 0 : SPECIES.length;
console.log(`Passed ${tested} builds (${atlasCount} atlas, ${tested - atlasCount} generated); ${jawChecks} jaws, ${pairedChecks} paired fin sets, ${eyeChecks} sockets, ${lobeChecks} manta lobe pairs, ${hornChecks} horn sets.`);
