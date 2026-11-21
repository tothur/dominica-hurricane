// Deterministic 3D Category 5 Hurricane simulation over Dominica (Caribbean).
// Reuses the tabletop particle & terrain-deposit pipeline for a rotating stadium-effect
// eyewall, logarithmic spiral rainbands, internal eyewall lightning, and flash-flood runoff.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Non-linear storm clock (seconds relative to direct eye passage over Dominica at t = 0).
// Spans -6 h (outer rainbands) through +9 h (clearing skies & watershed runoff),
// giving generous scrubbing resolution to the eyewall strikes and eye passage.
export function stormClock(u) {
  const x = clamp(u, 0, 1);
  if (x <= 0.14) return mix(-21600, -12600, x / 0.14);          // -6 h .. -3.5 h (outer approach)
  if (x <= 0.28) return mix(-12600, -5400, (x - 0.14) / 0.14);  // -3.5 h .. -1.5 h (tropical-storm squalls)
  if (x <= 0.42) return mix(-5400, -1200, (x - 0.28) / 0.14);   // -1.5 h .. -20 m (front Cat 5 eyewall)
  if (x <= 0.54) return mix(-1200, 1500, (x - 0.42) / 0.12);    // -20 m .. +25 m (direct eye passage)
  if (x <= 0.68) return mix(1500, 5400, (x - 0.54) / 0.14);     // +25 m .. +1.5 h (rear eyewall reversal)
  if (x <= 0.80) return mix(5400, 12600, (x - 0.68) / 0.12);    // +1.5 h .. +3.5 h (feeder bands & flash floods)
  if (x <= 0.90) return mix(12600, 21600, (x - 0.80) / 0.10);   // +3.5 h .. +6 h (storm departure)
  return mix(21600, 32400, (x - 0.90) / 0.10);                  // +6 h .. +9 h (clearing skies & runoff)
}

// Hurricane eye track & meteorological intensity over time t (seconds).
// Calibrated to NHC Tropical Cyclone Report AL152017 (Hurricane Maria, Dominica, Sept 18-19 2017):
// WNW heading (~300 deg) at ~8.3 kt (4.25 m/s / 15.3 km/h), 145 kt (268 km/h) / 922 hPa at landfall,
// brief mountain weakening to ~248 km/h / 930 hPa, then re-intensification over the eastern Caribbean.
export function stormEvolution(t, g = {}) {
  const eyeCx = g.eyeX ?? -536.6;
  const eyeCz = g.eyeZ ?? 1659.8;
  // Unit track vector: ESE -> WNW (~300 deg)
  const dirX = -0.866;
  const dirZ = -0.500;
  // True ~8.3 kt (4.25 m/s) forward motion: -6h is ~92 km ESE, 0h is direct over Dominica, +9h is ~138 km WNW (clearing!)
  const trackS = t * 4.25;
  const eyeX = eyeCx + dirX * trackS;
  const eyeZ = eyeCz + dirZ * trackS;

  // NHC Maria intensity curve: rapid intensification into landfall (922 hPa), brief mountain dip (930 hPa),
  // then re-intensification over warm Caribbean waters (down toward 912 hPa)
  const riRamp = 0.80 + 0.16 * smooth(-21600, -1800, t);
  const landFriction = 0.10 * Math.exp(-Math.pow((t - 2800) / 4200, 2));
  const caribReint = 0.06 * smooth(5400, 25000, t);
  const intensity = clamp(riRamp - landFriction + caribReint, 0.72, 1.0);

  // Wind speed (km/h), central pressure (hPa), sharp ~16 km eye radius, steep volcanic-shelf surge (1.8-2.7 m)
  const windKmh = Math.round(215 + 56 * intensity); // ~268 km/h (165 mph) at landfall, ~248 km/h over mountains, ~271 km/h Caribbean
  const pressureHpa = Math.round(944 - 24 * intensity - 6 * caribReint); // ~922 hPa landfall -> 930 hPa -> 914 hPa
  const eyeRadius = 7800 + 650 * (1 - intensity); // ~15.6-16.8 km diameter (NHC: ~9-10 nmi)
  const distToIsland = Math.hypot(eyeX - eyeCx, eyeZ - eyeCz);
  const islandImpact = Math.exp(-Math.pow(distToIsland / 24000, 2));
  // Steep volcanic island bathymetry (Dominica NHC report: peak 6-9 ft / 1.8-2.7 m surge)
  const surgeM = +(0.5 + 2.2 * intensity * islandImpact).toFixed(1);
  const rainRate = clamp(0.20 + 0.95 * Math.exp(-Math.pow(distToIsland / 30000, 2)), 0.1, 1.0);

  return {
    eyeX,
    eyeZ,
    eyeRadius,
    intensity,
    windKmh,
    pressureHpa,
    surgeM,
    rainRate,
    distToIsland,
  };
}

// No vertical terrain deformation needed for a hurricane (preserves real Copernicus DEM),
// but exported for clean interface parity with the tabletop engine.
export function terrainHeight(d) {
  return d;
}

export const HURRICANE_GLSL = /* glsl */`
float islandH(float d, vec2 xz) {
  return d;
}
`;

const CLOUD_COLORS = {
  topBright: [0.95, 0.96, 0.99],
  topWarm: [0.90, 0.92, 0.96],
  midWall: [0.76, 0.79, 0.85],
  baseDark: [0.46, 0.50, 0.58],
  bandDark: [0.54, 0.58, 0.65],
  cirrus: [0.96, 0.97, 1.00],
  spray: [0.80, 0.88, 0.94],
};

// Trace steepest-descent flash-flood drainage paths down Dominica's mountain watersheds.
function traceWatershedPaths(terrain, g) {
  const seeds = [
    // Morne Diablotins & Morne Trois Pitons ridges draining to Roseau, Layou, Marigot, La Plaine, Portsmouth
    { x: -4600, z: -8400, vx: -0.9, vz: 0.4 },   // Layou River (west)
    { x: -5800, z: -9800, vx: -0.7, vz: -0.7 },  // Portsmouth / Picard
    { x: -3200, z: -8800, vx: 0.85, vz: -0.35 }, // Pagua / Marigot (NE)
    { x: 1800, z: 5100, vx: -0.85, vz: 0.55 },   // Roseau River (SW)
    { x: 3200, z: 4600, vx: 0.90, vz: 0.35 },    // La Plaine / Rosalie (SE)
    { x: 1100, z: 7200, vx: -0.6, vz: 0.8 },     // Soufrière / Geneva (S)
    { x: -1600, z: -2200, vx: 0.85, vz: 0.15 },  // Castle Bruce (E)
    { x: -2400, z: 1200, vx: -0.95, vz: 0.2 },   // Mahaut / Canefield (W)
  ];
  const half = g.half ?? 42000;
  const paths = [];
  for (const s0 of seeds) {
    let x = s0.x, z = s0.z;
    let vx = s0.vx, vz = s0.vz;
    const pts = [];
    let sDist = 0;
    const step = 180;
    for (let k = 0; k < 120; k++) {
      const h = terrain(x, z);
      pts.push({ x, z, h, s: sDist });
      if (h <= 2.5 || Math.abs(x) > half - 800 || Math.abs(z) > half - 800) break;
      const e = 120;
      const gx = (terrain(x + e, z) - terrain(x - e, z)) / (2 * e);
      const gz = (terrain(x, z + e) - terrain(x, z - e)) / (2 * e);
      const gm = Math.hypot(gx, gz);
      if (gm > 1e-4) {
        vx = vx * 0.45 - (gx / gm) * 0.55;
        vz = vz * 0.45 - (gz / gm) * 0.55;
      }
      const vm = Math.hypot(vx, vz) || 1;
      vx /= vm;
      vz /= vm;
      x += vx * step;
      z += vz * step;
      sDist += step;
    }
    if (pts.length >= 4) paths.push({ points: pts, length: sDist });
  }
  return paths;
}

export function createHurricane(g, terrain) {
  const R = random(20170918); // Hurricane Maria Dominica date seed
  const paths = traceWatershedPaths(terrain, g);

  // 1. Pre-seeded stadium-effect eyewall cloud columns (5 vertical tiers, counter-clockwise)
  // Large overlapping cumulus puffs form a solid, dramatic amphitheater around the clear eye
  const eyewall = [];
  const TIERS = [
    { y0: 900, y1: 2300, rMul: 0.96, n: 64, sz: [4200, 5600], col: CLOUD_COLORS.baseDark, alpha: 0.70 },
    { y0: 2500, y1: 4800, rMul: 1.05, n: 74, sz: [4800, 6400], col: CLOUD_COLORS.midWall, alpha: 0.76 },
    { y0: 5000, y1: 7500, rMul: 1.16, n: 80, sz: [5400, 7200], col: CLOUD_COLORS.topWarm, alpha: 0.80 },
    { y0: 7600, y1: 9900, rMul: 1.32, n: 84, sz: [6000, 8000], col: CLOUD_COLORS.topBright, alpha: 0.82 },
    { y0: 10000, y1: 11800, rMul: 1.52, n: 78, sz: [6800, 9200], col: CLOUD_COLORS.cirrus, alpha: 0.68 },
  ];
  for (let ti = 0; ti < TIERS.length; ti++) {
    const tr = TIERS[ti];
    for (let i = 0; i < tr.n; i++) {
      const baseAngle = (i / tr.n) * Math.PI * 2 + (R() - 0.5) * 0.10;
      const rJitter = 0.94 + R() * 0.14;
      eyewall.push({
        tier: ti,
        angle: baseAngle,
        rMul: tr.rMul * rJitter,
        y: mix(tr.y0, tr.y1, R()),
        size: mix(tr.sz[0], tr.sz[1], R()),
        col: tr.col,
        alpha: tr.alpha * (0.88 + R() * 0.22),
        angVel: (0.0048 - ti * 0.00045) * (0.92 + R() * 0.16), // rad/s counter-clockwise
        seed: R() * 6.283,
        bobPhase: R() * 6.283,
      });
    }
  }

  // 2. Four sweeping logarithmic spiral rainbands wrapping outward from the eyewall
  const spiralBands = [];
  const N_ARMS = 4;
  for (let arm = 0; arm < N_ARMS; arm++) {
    const armOffset = (arm / N_ARMS) * Math.PI * 2;
    const isPrimary = arm % 2 === 0;
    const count = isPrimary ? 155 : 115;
    for (let i = 0; i < count; i++) {
      const f = i / count; // 0 = inner eyewall merge, 1 = outer Atlantic/Caribbean tail
      const theta = f * Math.PI * (isPrimary ? 2.45 : 1.95) + (R() - 0.5) * 0.06;
      // Tight cohesive logarithmic spiral from ~1.36 * eyeR out to ~4.8 * eyeR
      const rMul = 1.36 * Math.exp(0.50 * theta) + (R() - 0.5) * (0.14 + 0.22 * f);
      const layer = i % 3; // 0 = dark storm base, 1 = mid convective tower, 2 = bright white top
      const y = layer === 0
        ? 1100 + R() * 1700
        : layer === 1
          ? 3600 + R() * 3100
          : 7400 + R() * 3200 * (1 - 0.25 * f);
      const col = layer === 0
        ? CLOUD_COLORS.bandDark
        : layer === 1
          ? CLOUD_COLORS.midWall
          : CLOUD_COLORS.topBright;
      spiralBands.push({
        arm,
        armOffset,
        theta,
        f,
        rMul,
        y,
        size: (5200 + 4800 * f) * (layer === 2 ? 1.18 : 0.96) * (0.86 + R() * 0.28),
        col,
        alpha: (layer === 2 ? 0.68 : 0.62) * (1 - 0.34 * f) * (isPrimary ? 1.0 : 0.88),
        angVel: 0.0038 / (0.65 + 0.55 * rMul), // Keplerian-like differential spin (faster near eye!)
        seed: R() * 6.283,
        layer,
      });
    }
  }

  // 3. High-altitude cirrus outflow canopy (bright white wispy halo outside the clear eye)
  const outflow = [];
  for (let i = 0; i < 140; i++) {
    const f = R();
    const rMul = 1.55 + Math.pow(f, 0.75) * 3.4;
    const angle = R() * Math.PI * 2;
    outflow.push({
      angle,
      rMul,
      y: 10800 + R() * 1700,
      size: 4800 + R() * 4400,
      alpha: 0.30 * (1 - 0.55 * f),
      angVel: 0.0011 / (0.5 + 0.4 * rMul),
      seed: R() * 6.283,
    });
  }

  // 4. Low-level ocean spray & mountain orographic cloud mist
  const spray = [];
  for (let i = 0; i < 90; i++) {
    spray.push({
      angle: R() * Math.PI * 2,
      rMul: 0.92 + R() * 1.45,
      y: 180 + R() * 520,
      size: 1600 + R() * 1600,
      alpha: 0.24 + R() * 0.16,
      angVel: 0.0052 * (0.85 + R() * 0.3),
      seed: R() * 6.283,
    });
  }

  // 5. Internal eyewall & convective band lightning cells + wind-whipped rain streaks
  const lightningCells = [];
  for (let i = 0; i < 42; i++) {
    const inEye = i < 28;
    lightningCells.push({
      angle: R() * Math.PI * 2,
      rMul: inEye ? (1.02 + R() * 0.38) : (1.7 + R() * 2.2),
      y0: 1400 + R() * 2200,
      y1: 5800 + R() * 4200,
      period: 4.5 + R() * 11.0,
      phase: R() * 15.0,
      angVel: inEye ? 0.0044 : 0.0022,
      inEye,
    });
  }

  const windStreaks = [];
  for (let i = 0; i < 220; i++) {
    const rMul = 0.94 + Math.pow(R(), 1.2) * 2.2;
    windStreaks.push({
      angle: R() * Math.PI * 2,
      rMul,
      y: 260 + R() * 3400,
      size: 55 + R() * 65,
      angVel: 0.0055 / (0.65 + 0.35 * rMul),
      phase: R() * 6.283,
    });
  }

  // 6. Pre-built steepest-descent flash-flood runoff deposits along Dominica's river valleys
  const floodDeposits = [];
  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    for (let j = 0; j < path.points.length; j += 2) {
      const pt = path.points[j];
      const f = pt.s / Math.max(1, path.length);
      floodDeposits.push({
        x: pt.x,
        z: pt.z,
        // Watershed floods build during front eyewall (-5400s) and peak after rear eyewall (+3600s)
        birth: -6200 + f * 4800 + (pi % 3) * 450,
        radius: 360 + 480 * f,
        amount: 18,
      });
    }
  }
  floodDeposits.sort((a, b) => a.birth - b.birth);

  // Cumulative rainfall darkening patches across Dominica
  const rainPatches = [];
  for (let i = 0; i < 180; i++) {
    const rx = (R() - 0.5) * 30000;
    const rz = (R() - 0.5) * 48000;
    if (terrain(rx, rz) < 10) continue;
    rainPatches.push({
      x: rx,
      z: rz,
      birth: -12000 + R() * 19000,
      radius: 1600 + R() * 1800,
      amount: 12 + R() * 12,
    });
  }
  rainPatches.sort((a, b) => a.birth - b.birth);

  function sample(time, surface = terrain) {
    const smoke = [];
    const glow = [];
    const flashes = [];
    const flowDeposits = [];
    const ashDeposits = [];

    const ev = stormEvolution(time, g);
    const { eyeX, eyeZ, eyeRadius, intensity } = ev;

    // Active internal eyewall & convective band lightning flashes (up to 6 simultaneous 3D flash cells)
    for (let i = 0; i < lightningCells.length; i++) {
      const lc = lightningCells[i];
      const cyc = (((time * 0.14 + lc.phase) % lc.period) + lc.period) % lc.period;
      if (cyc < 0.42) {
        const flash = Math.sin((cyc / 0.42) * Math.PI) * intensity;
        const ang = lc.angle - time * lc.angVel;
        const r = eyeRadius * lc.rMul;
        const fx = eyeX + Math.cos(ang) * r;
        const fz = eyeZ + Math.sin(ang) * r;
        const fy = (lc.y0 + lc.y1) * 0.5;
        if (flashes.length < 6) {
          flashes.push({ x: fx, y: fy, z: fz, power: flash * 1.35 });
        }

        // Crisp jagged branching lightning shaft inside the eyewall stadium
        const jx = Math.sin(i * 17.3) * 190;
        const jz = Math.cos(i * 11.7) * 190;
        glow.push({
          x: fx,
          y: fy,
          z: fz,
          vx: jx * 1.2,
          vy: -11500,
          vz: jz * 1.2,
          size: 130 * flash,
          temp: clamp(0.92 + 0.28 * flash, 0.78, 1.2),
        });
        glow.push({
          x: fx + jx * 1.1,
          y: fy - 1100,
          z: fz + jz * 1.1,
          vx: -jx * 2.4,
          vy: -6500,
          vz: -jz * 2.4,
          size: 85 * flash,
          temp: clamp(0.84 + 0.24 * flash, 0.76, 1.12),
        });
      }
    }

    // Subtle horizontal counter-clockwise wind-driven rain/sea-spray streaks hugging the eyewall base
    for (let i = 0; i < windStreaks.length; i++) {
      const ws = windStreaks[i];
      if (ws.rMul > 1.45) continue;
      const ang = ws.angle - time * ws.angVel;
      const r = eyeRadius * ws.rMul;
      const x = eyeX + Math.cos(ang) * r;
      const z = eyeZ + Math.sin(ang) * r;
      const tx = Math.sin(ang);
      const tz = -Math.cos(ang);
      const speed = 1550 * intensity / (0.7 + 0.35 * ws.rMul);
      const shimmer = 0.24 + 0.18 * Math.sin(time * 0.08 + ws.phase);
      glow.push({
        x,
        y: ws.y * 0.55,
        z,
        vx: tx * speed,
        vy: -220,
        vz: tz * speed,
        size: ws.size * 0.75,
        temp: shimmer * intensity,
      });
    }

    // Flash-flood river swelling & runoff deposits along Dominica's mountain watersheds
    for (let i = 0; i < floodDeposits.length; i++) {
      const d = floodDeposits[i];
      if (time >= d.birth) {
        const age = time - d.birth;
        const surge = smooth(0, 2400, age) * Math.exp(-Math.max(0, age - 9000) / 28000);
        flowDeposits.push({ x: d.x, z: d.z, radius: d.radius, amount: d.amount, heat: surge });
      }
    }

    // Cumulative rain-darkened rainforest saturation
    for (let i = 0; i < rainPatches.length; i++) {
      const rp = rainPatches[i];
      if (time >= rp.birth) {
        ashDeposits.push({ x: rp.x, z: rp.z, radius: rp.radius, amount: rp.amount });
      }
    }

    return { smoke, glow, flashes, flowDeposits, ashDeposits, evolution: ev };
  }

  return { paths, sample, source: { x: g.eyeX ?? 0, y: 0, z: g.eyeZ ?? 0 } };
}
