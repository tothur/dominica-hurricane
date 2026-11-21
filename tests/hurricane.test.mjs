import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { shortCircuit: true, url: 'three:mock' };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'three:mock') {
      return {
        shortCircuit: true,
        format: 'module',
        source: `
          export class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; } }
          export class Float32BufferAttribute extends BufferAttribute {}
          export class BufferGeometry { constructor() { this.attributes = {}; this.index = null; } setAttribute(n, a) { this.attributes[n] = a; return this; } setIndex(i) { this.index = Array.isArray(i) ? { count: i.length, array: i } : i; return this; } translate() { return this; } }
          export class CylinderGeometry extends BufferGeometry { constructor(rt, rb, h, segs) { super(); this.radius = rt; this.height = h; this.attributes.position = { count: (segs + 1) * 4 }; this.index = { count: segs * 12 }; } }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const { stormClock, stormEvolution, createHurricane } = await import('../hurricane-model.mjs');
const { buildHurricaneShellGeometry } = await import('../hurricane-clouds.mjs');
const { DOCK_LAYOUT, DRAWER_STAGES_LAYOUT, DRAWER_VIEW_LAYOUT, DOCK_W, DOCK_H, HAND_JOINTS, createPalmOccluderGeometry, hitTestSurface } = await import('../quest-tabletop.mjs');
const { clipmapCenter } = await import('../terrain-lod.mjs');

const meta = JSON.parse(fs.readFileSync(new URL('../data/meta.json', import.meta.url), 'utf8'));
const g = { cx: meta.center[0], cz: meta.center[1], eyeX: meta.island.eyeCenter[0], eyeZ: meta.island.eyeCenter[1], half: meta.size / 2 };
const syntheticTerrain = (x, z) => Math.max(0, 1400 * Math.exp(-(x * x / (12000 * 12000) + z * z / (22000 * 22000))));

test('stormClock is continuous and monotonic from -6 h approach through +9 h clearing', () => {
  let prev = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = stormClock(i / 100);
    assert.ok(Number.isFinite(t), `non-finite time at ${i}`);
    assert.ok(t >= prev, `non-monotonic at ${i}: ${t} < ${prev}`);
    prev = t;
  }
  assert.equal(stormClock(0), -21600);
  assert.equal(stormClock(1), 32400);
});

test('stormEvolution tracks eye ESE -> WNW across Dominica at Category 5 strength', () => {
  const pre = stormEvolution(-14400, g);
  const eye = stormEvolution(0, g);
  const post = stormEvolution(14400, g);
  assert.ok(pre.eyeX > eye.eyeX && eye.eyeX > post.eyeX, 'eye moves westward');
  assert.ok(pre.eyeZ > eye.eyeZ && eye.eyeZ > post.eyeZ, 'eye moves northward');
  assert.ok(eye.windKmh >= 252, `Cat 5 wind speed >= 252 km/h, got ${eye.windKmh}`);
  assert.ok(eye.pressureHpa <= 930, `Cat 5 pressure <= 930 hPa, got ${eye.pressureHpa}`);
  assert.ok(eye.distToIsland < 100, 'eye passes directly over Dominica at t = 0');
});

test('createHurricane & volumetric multi-shell cloud mesh produce finite storm fields within budgets', () => {
  const h = createHurricane(g, syntheticTerrain);
  assert.ok(h.paths.length >= 6, 'traced Dominica mountain watershed paths');
  const sA = h.sample(0, syntheticTerrain);
  const sB = h.sample(0, syntheticTerrain);
  assert.equal(sA.glow.length, sB.glow.length);
  assert.equal(sA.flashes.length, sB.flashes.length);
  for (const t of [-21600, -7200, -2400, 0, 2400, 9000, 25000]) {
    const s = h.sample(t, syntheticTerrain);
    assert.ok(Array.isArray(s.flashes) && s.flashes.length <= 6, `flashes budget: ${s.flashes.length}`);
    assert.ok(s.glow.length < 1500, `glow budget: ${s.glow.length}`);
    for (const p of s.glow) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
  const deskGeom = buildHurricaneShellGeometry({ maxRadius: 118000 });
  const vrGeom = buildHurricaneShellGeometry({ maxRadius: 56000 });
  assert.ok(deskGeom.attributes.position.count > 100 && deskGeom.index.count > 0);
  assert.ok(vrGeom.attributes.position.count > 100 && vrGeom.index.count > 0);
});

test('WebXR dock, drawer layouts, hand occlusion and clipmap LOD are valid for 84 km Dominica domain', () => {
  for (const r of DOCK_LAYOUT) {
    const hit = hitTestSurface(DOCK_LAYOUT, DOCK_W, DOCK_H, (r.x0 + r.x1) / (2 * DOCK_W), 1 - (r.y0 + r.y1) / (2 * DOCK_H));
    assert.equal(hit?.id, r.id);
  }
  assert.equal(DRAWER_STAGES_LAYOUT.length, 13);
  assert.equal(DRAWER_VIEW_LAYOUT.length, 16);
  assert.equal(HAND_JOINTS.length, 25);
  assert.ok(createPalmOccluderGeometry().index.count > 0);
  const c = clipmapCenter(1234, -5678, 32, false);
  assert.equal(Math.abs(c.x % 32), 0);
  assert.equal(Math.abs(c.z % 32), 0);
});
