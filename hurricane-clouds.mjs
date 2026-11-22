import * as THREE from 'three';

// True 3D Volumetric Raymarched Category 5 Hurricane Engine.
// Satellite-realistic dense Central Dense Overcast (CDO), sharp stadium eye,
// continuous multi-layered overlapping spiral cloud ridges, boiling convective tops,
// radiating high-altitude cirrus outflow, and true 3D Beer-Lambert sun self-shadowing.

export const HURRICANE_CLOUD_COMMON = /* glsl */`
// Smooth 3D volumetric density field for a satellite-realistic Category 5 Hurricane.
// Returns vec4(density, topHeightNorm, eyewallFactor, cirrusFactor) at world position p (meters).
vec4 sampleHurricaneField(
  vec3 p,
  vec2 eyePos,
  float eyeR,
  float stormInt,
  float timeS,
  sampler2D noiseTex
) {
  float h = clamp((p.y - 950.0) / 11850.0, 0.0, 1.0);
  if (p.y < 820.0 || p.y > 13000.0) return vec4(0.0);

  vec2 rel = p.xz - eyePos;
  float r = length(rel);
  float rNorm = r / max(eyeR, 1000.0);
  float ang = atan(rel.y, rel.x);

  // Rigidly rotated isotropic coordinates (zero shear!) for authentic boiling cloud-top cauliflower
  float spinFast = timeS * 0.0024;
  float spinOuter = timeS * 0.00070;
  float cr = cos(spinOuter), sr = sin(spinOuter);
  vec2 isoRel = vec2(cr * rel.x - sr * rel.y, sr * rel.x + cr * rel.y);

  // Multi-scale isotropic FBM for rich GOES-16 satellite cloud-top texture (50 km down to 5.5 km)
  vec2 uv1 = isoRel / 52000.0;
  float m1 = texture2D(noiseTex, uv1).r;
  float m2 = texture2D(noiseTex, uv1 * 2.25 + vec2(m1 * 0.24, -m1 * 0.20) + vec2(0.19, 0.37)).r;
  float m3 = texture2D(noiseTex, uv1 * 4.9 + vec2(-m2 * 0.20, m1 * 0.16) + vec2(0.41, 0.13)).r;
  float m4 = texture2D(noiseTex, uv1 * 9.8 + vec2(m3 * 0.15, -m2 * 0.14)).r;
  float isoFbm = m1 * 0.42 + m2 * 0.30 + m3 * 0.18 + m4 * 0.10;
  float cauli = m2 * 0.38 + m3 * 0.38 + m4 * 0.24;

  // Gently swirled coordinates for macro spiral striations & eyewall mesovortex ripples
  float logR = log(max(rNorm, 0.42));
  float coreW = smoothstep(3.8, 1.0, rNorm);
  float coreTwist = (-1.10 * logR + spinFast * 0.50) * coreW;
  float ct = cos(coreTwist), st = sin(coreTwist);
  vec2 coreRel = vec2(ct * isoRel.x - st * isoRel.y, st * isoRel.x + ct * isoRel.y);
  float coreFbm = texture2D(noiseTex, coreRel / 22000.0).r * 0.58 + texture2D(noiseTex, coreRel / 9500.0).r * 0.42;

  // Sharp, deep organic stadium-effect Cat 5 eye with 3D vertical billowing cloud-wall relief
  float wallBillow = texture2D(noiseTex, vec2(ang * 1.91 + spinFast * 0.6, h * 1.85)).r * 0.6
    + texture2D(noiseTex, vec2(ang * 3.82 - spinFast * 0.4, h * 3.9)).r * 0.4;
  float eyeRipple = 1.0
    + 0.042 * sin(ang * 3.0 + spinFast * 1.3)
    + 0.024 * cos(ang * 5.0 - spinFast * 0.9)
    + (coreFbm - 0.5) * 0.16
    + (wallBillow - 0.5) * 0.22;
  float rEyeH = eyeR * (0.80 + 0.54 * h * h) * eyeRipple;

  // Crystal-clear eye opening plunging directly down onto Dominica
  float eyeMask = smoothstep(rEyeH * 0.90, rEyeH * 1.15, r);
  if (eyeMask < 0.005) return vec4(0.0);

  // Realistic broad Cat 5 asymmetry (huge right-front NE shield + sweeping SE inflow tail)
  float asym = 1.0 + 0.22 * cos(ang + 0.70) + 0.12 * sin(ang * 2.0 - 0.45);
  float rEff = rNorm / asym;

  // Continuous, broad, overlapping counter-clockwise spiral ridges & deep cloud canyons
  float bandWarp = (m1 - 0.5) * 2.3 + (m2 - 0.5) * 1.1;
  float spiralPhase = ang - 2.35 * logR + spinFast * 0.38;
  // Overlapping primary & secondary spiral waves (broad ridges, narrow shadowed canyons — NOT sparse rings!)
  float wave2 = 0.5 + 0.5 * sin(spiralPhase * 2.0 + bandWarp);
  float wave3 = 0.5 + 0.5 * sin(spiralPhase * 3.0 + 1.35 + bandWarp * 1.15);
  float wave5 = 0.5 + 0.5 * sin(spiralPhase * 5.0 - 0.8 + bandWarp * 1.3);
  float spiralRidges = max(smoothstep(0.10, 0.88, wave2), smoothstep(0.18, 0.90, wave3) * 0.86);
  float fineRidges = smoothstep(0.25, 0.85, wave5) * 0.45;

  // 1. Massive Solid Central Dense Overcast (CDO): completely opaque cloud continent out to ~55-70 km!
  float eyewallRing = exp(-pow((rNorm - (1.08 + 0.44 * h * h)) / 0.62, 2.0));
  float cdo = smoothstep(6.8, 2.2, rEff + (isoFbm - 0.5) * 2.2);

  // 2. Continuous lower-to-mid overcast blanket underneath the spiral canyons (hides ocean out to ~85 km!)
  float lowerBlanket = smoothstep(11.5, 4.5, rEff + (m1 - 0.5) * 3.2);
  // Only far out (> 80 km) do the outer spiral rainbands separate into distinct arms over dark ocean
  float outerSpiral = smoothstep(17.5, 6.2, rEff + (m1 - 0.5) * 3.5)
    * smoothstep(0.22, 0.72, spiralRidges * (0.68 + 0.65 * isoFbm));

  // Combined massive horizontal cloud cover (virtually 100% solid across inner 130+ km diameter!)
  float horiz = clamp(max(max(cdo * 1.25, lowerBlanket * (0.72 + 0.45 * spiralRidges)), outerSpiral * 1.12), 0.0, 1.0);

  // 3. Soft low-altitude tropical trade-wind cumulus over the outer ocean (thick enough to never alias/speckle)
  float tradeEnv = smoothstep(7.5, 10.5, rEff) * smoothstep(18.0, 12.2, rEff);
  float tradeDens = tradeEnv * smoothstep(0.46, 0.78, m2 * 0.65 + m3 * 0.35)
    * smoothstep(0.01, 0.10, h) * smoothstep(0.36, 0.12, h) * 0.52;

  // 4. Radiating high-altitude silky cirrus outflow canopy fanning across the entire CDO & outer shield
  float outPhase = ang + 0.55 * logR - spinOuter * 0.30;
  float cirrusBand = 0.5 + 0.5 * sin(outPhase * 7.0 + m1 * 4.5 + m2 * 2.2);
  float cirrusVert = smoothstep(0.68, 0.88, h) * smoothstep(1.0, 0.84, h);
  float cirrusDens = cirrusVert * smoothstep(13.5, 2.5, rEff) * eyeMask
    * smoothstep(0.22, 0.78, (cdo * 0.78 + spiralRidges * 0.65) * (0.48 + 0.65 * cirrusBand) * (0.55 + 0.55 * m2)) * 0.46;

  // Rich sculpted 3D cloud-top topography with deep spiral canyons & towering eyewall turrets:
  float ridgeRelief = (spiralRidges * 0.34 + fineRidges * 0.14) * smoothstep(1.1, 3.0, rEff);
  float turretRelief = (cauli - 0.44) * (0.30 + 0.16 * cdo);
  float outerSlope = mix(0.28, 0.78, smoothstep(15.5, 3.0, rEff));
  // Carve genuine 3D valleys between spiral bands so stereo VR sees dramatic multi-level cloud cliffs
  float canyonDip = (1.0 - spiralRidges) * smoothstep(1.6, 3.4, rEff) * 0.28;

  float topH = clamp(
    cdo * (0.68 + 0.18 * coreFbm)
    + eyewallRing * (0.24 + 0.14 * cauli)
    + (1.0 - cdo * 0.60) * (lowerBlanket * 0.34 + outerSpiral * outerSlope * 0.54)
    + ridgeRelief * smoothstep(16.0, 4.0, rEff)
    + turretRelief * horiz
    - canyonDip,
    0.0,
    1.0
  ) * clamp(0.78 + 0.22 * stormInt, 0.0, 1.0);

  // Flat dark storm base (~1050-1350 m, dipping slightly to ~900 m in eyewall) and billowing sculpted cloud tops
  float baseH = 0.02 + 0.045 * (1.0 - eyewallRing) + (cauli - 0.5) * 0.045;
  float topFadeSpan = mix(0.20, 0.12, cdo);
  float vertEnv = smoothstep(baseH - 0.03, baseH + 0.065, h) * smoothstep(topH + 0.035, topH - topFadeSpan, h);

  // Thick, genuinely opaque volumetric cloud mass
  float mainDens = smoothstep(0.08, 0.52, horiz * (0.76 + 0.48 * cauli)) * vertEnv;
  mainDens = max(mainDens, eyewallRing * (0.82 + 0.25 * coreFbm) * smoothstep(topH + 0.03, topH - 0.10, h) * smoothstep(0.0, 0.06, h));
  mainDens *= eyeMask;

  float dens = clamp(max(mainDens, tradeDens * eyeMask) + cirrusDens, 0.0, 1.0);
  return vec4(dens, topH, eyewallRing * eyeMask, cirrusDens);
}

// Fast 2D sun-angled cloud shadow coverage evaluated directly on Dominica terrain & ocean
float hurricaneCloudShadow(
  vec2 xz,
  vec2 eyePos,
  float eyeR,
  float stormInt,
  float timeS,
  vec3 sunDir,
  sampler2D noiseTex
) {
  vec2 sunOff = -sunDir.xz / max(sunDir.y, 0.28) * 6000.0;
  vec2 rel = (xz + sunOff) - eyePos;
  float r = length(rel);
  float rNorm = r / max(eyeR, 1000.0);
  float ang = atan(rel.y, rel.x);
  float eyeMask = smoothstep(eyeR * 0.90, eyeR * 1.22, r);
  if (eyeMask < 0.01) return 0.0;

  float spinOuter = timeS * 0.00070;
  float cr = cos(spinOuter), sr = sin(spinOuter);
  vec2 isoRel = vec2(cr * rel.x - sr * rel.y, sr * rel.x + cr * rel.y);
  float m1 = texture2D(noiseTex, isoRel / 52000.0).r;

  float asym = 1.0 + 0.22 * cos(ang + 0.70) + 0.12 * sin(ang * 2.0 - 0.45);
  float rEff = rNorm / asym;
  float logR = log(max(rNorm, 0.42));
  float spiralPhase = ang - 2.35 * logR + timeS * 0.0024 * 0.38;
  float ridges = 0.5 + 0.5 * sin(spiralPhase * 2.0 + (m1 - 0.5) * 2.3);
  float cdo = smoothstep(7.2, 2.2, rEff + (m1 - 0.5) * 2.0);
  float blanket = smoothstep(12.5, 5.0, rEff) * (0.65 + 0.45 * ridges);
  return clamp(max(cdo, blanket) * eyeMask * stormInt, 0.0, 1.0);
}
`;

// Build the lightweight raymarch bounding cylinder (just 128 triangles, 1 draw call!)
// Extends down to y = -150 m so ground-level Walk/island cameras are cleanly inside the volume.
export function buildHurricaneShellGeometry({
  maxRadius = 150000,
  minHeight = -150,
  maxHeight = 13200,
  radialSegments = 64,
} = {}) {
  const height = maxHeight - minHeight;
  const g = new THREE.CylinderGeometry(maxRadius, maxRadius, height, radialSegments, 1, false);
  g.translate(0, minHeight + height * 0.5, 0);
  return g;
}

const HURRICANE_VOL_VS = /* glsl */`
uniform vec2 uEyePos;
uniform float uExag, uVertScale;
uniform mat4 uInvModel;
varying vec3 vLocalPos;
varying vec3 vCamLocal;
void main() {
  float cloudExag = uVertScale * mix(1.0, uExag, 0.35);
  vec3 wp = vec3(position.x + uEyePos.x, position.y * cloudExag, position.z + uEyePos.y);
  vLocalPos = wp;
  // Per-eye exact local camera position! Gives true Left/Right stereo 3D parallax in Quest 3 VR.
  vCamLocal = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

export function buildHurricaneFS({ tabletop = false, steps = tabletop ? 24 : 38 } = {}) {
  const shadowTaps = tabletop ? 2 : 3;
  return /* glsl */`
uniform sampler2D tNoise, tD;
uniform vec2 uEyePos;
uniform vec3 uSunDir, uSunCol, uSky, uBounce, uFogCol;
uniform float uEyeR, uStormInt, uTime, uExag, uVertScale, uMaxR, uClipHalf, uFogD, uSize, uND, uTerrainClip;
uniform vec4 uFlashes[6];
varying vec3 vLocalPos;
varying vec3 vCamLocal;

${HURRICANE_CLOUD_COMMON}

float sampleTerrainY(vec2 xz) {
  vec2 uv = (xz + 0.5 * uSize) / uSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 p = uv * (uND - 1.0);
  vec2 i0 = clamp(floor(p), vec2(0.0), vec2(uND - 2.0));
  vec2 f = clamp(p - i0, 0.0, 1.0);
  ivec2 ii = ivec2(i0);
  float a = texelFetch(tD, ii, 0).r;
  float b = texelFetch(tD, ii + ivec2(1, 0), 0).r;
  float c = texelFetch(tD, ii + ivec2(0, 1), 0).r;
  float d = texelFetch(tD, ii + ivec2(1, 1), 0).r;
  return max(0.0, mix(mix(a, b, f.x), mix(c, d, f.x), f.y)) * uExag;
}

float evalDensityFast(vec3 p) {
  if (uClipHalf < 500000.0) {
    if (abs(p.x) > uClipHalf || abs(p.z) > uClipHalf) return 0.0;
  }
  return sampleHurricaneField(p, uEyePos, uEyeR, uStormInt, uTime, tNoise).x;
}

void main() {
  float cloudExag = uVertScale * mix(1.0, uExag, 0.35);
  // Work in un-exaggerated physical meters using per-eye vCamLocal for true 3D stereo depth!
  vec3 ro = vec3(vCamLocal.x, vCamLocal.y / cloudExag, vCamLocal.z);
  vec3 target = vec3(vLocalPos.x, vLocalPos.y / cloudExag, vLocalPos.z);
  vec3 rd = normalize(target - ro);

  // Analytic ray intersection with horizontal cloud slab [820 m, 13000 m]
  float invY = 1.0 / (abs(rd.y) < 1e-5 ? (rd.y >= 0.0 ? 1e-5 : -1e-5) : rd.y);
  float ty0 = (820.0 - ro.y) * invY;
  float ty1 = (13000.0 - ro.y) * invY;
  float tMin = min(ty0, ty1);
  float tMax = max(ty0, ty1);

  // Analytic ray intersection with outer bounding cylinder radius uMaxR around uEyePos
  vec2 oc = ro.xz - uEyePos;
  float aC = dot(rd.xz, rd.xz);
  if (aC > 1e-7) {
    float bC = dot(oc, rd.xz);
    float cC = dot(oc, oc) - uMaxR * uMaxR;
    float disc = bC * bC - aC * cC;
    if (disc < 0.0) discard;
    float sq = sqrt(disc);
    tMin = max(tMin, (-bC - sq) / aC);
    tMax = min(tMax, (-bC + sq) / aC);
  }

  // Optional tight tabletop plinth box clipping in Quest 3 VR
  if (uClipHalf < 500000.0) {
    vec2 invXZ = 1.0 / vec2(
      abs(rd.x) < 1e-5 ? 1e-5 : rd.x,
      abs(rd.z) < 1e-5 ? 1e-5 : rd.z
    );
    vec2 t0b = (-vec2(uClipHalf) - ro.xz) * invXZ;
    vec2 t1b = ( vec2(uClipHalf) - ro.xz) * invXZ;
    vec2 tLo = min(t0b, t1b);
    vec2 tHi = max(t0b, t1b);
    tMin = max(tMin, max(tLo.x, tLo.y));
    tMax = min(tMax, min(tHi.x, tHi.y));
  }

  tMin = max(tMin, 0.0);
  if (tMax <= tMin) discard;

  // Exact mountain & ocean occlusion when viewing from ground/island level (Walk, Roseau, Diablotins)
  if (uTerrainClip > 0.5) {
    // 1) Analytic ocean hit (y = 0)
    if (rd.y < -1e-4 && ro.y > 0.0) {
      float tSea = -ro.y / rd.y;
      tMax = min(tMax, tSea);
    }
    // 2) Smooth quadratic terrain intersection march against bilinear Dominica DEM (tD) + 4-step binary search
    float maxTerrH = 1600.0 * uExag / cloudExag;
    float tTerrEnd = min(tMax, 48000.0);
    if (tTerrEnd > 0.0 && (ro.y < maxTerrH || rd.y < 0.0)) {
      float tPrev = 0.0;
      for (int k = 1; k <= 32; k++) {
        float fk = float(k) / 32.0;
        float tCur = tTerrEnd * (fk * 0.25 + fk * fk * 0.75);
        vec3 pT = ro + rd * tCur;
        if (pT.y < maxTerrH) {
          float gY = sampleTerrainY(pT.xz) / cloudExag;
          if (pT.y <= gY) {
            float lo = tPrev, hi = tCur;
            for (int b = 0; b < 4; b++) {
              float mid = 0.5 * (lo + hi);
              vec3 pM = ro + rd * mid;
              if (pM.y <= sampleTerrainY(pM.xz) / cloudExag) hi = mid;
              else lo = mid;
            }
            tMax = min(tMax, hi);
            break;
          }
        }
        tPrev = tCur;
      }
    }
    if (tMax <= tMin) discard;
  }

  // Keep step size tight on VR tabletop & ground views.
  // In Quest 3 VR (foveated rendering), skip per-pixel IGN dithering so zero static noise appears over the ocean!
  float maxSpan = uTerrainClip > 0.5 ? 42000.0 : ${tabletop ? '56000.0' : '96000.0'};
  float marchSpan = min(tMax - tMin, maxSpan);
  float dt = marchSpan / float(${steps});
  ${tabletop
    ? 'float t = tMin + dt * 0.5;'
    : 'float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); float t = tMin + dt * (0.20 + 0.60 * ign);'
  }

  // Henyey-Greenstein forward scattering phase for bright silver linings
  float cosTheta = dot(rd, uSunDir);
  float g = 0.42;
  float hg = (1.0 - g * g) / (4.0 * 3.14159 * pow(max(0.15, 1.0 + g * g - 2.0 * g * cosTheta), 1.5));
  float phase = mix(0.68, 1.55, clamp(hg * 3.2, 0.0, 1.0));

  vec3 accum = vec3(0.0);
  float trans = 1.0;
  float hitDist = tMin;
  bool gotHit = false;
  // Boost subtle brooding blue-slate cloud underside luminance when looking UP from Dominica
  float lookUpBoost = smoothstep(0.02, 0.35, rd.y);

  for (int i = 0; i < ${steps}; i++) {
    vec3 p = ro + rd * t;
    vec4 fld = sampleHurricaneField(p, uEyePos, uEyeR, uStormInt, uTime, tNoise);
    float dens = fld.x;

    // Smooth generous edge fade near Quest 3 tabletop plinth border
    if (uClipHalf < 500000.0 && dens > 0.005) {
      float edge = max(abs(p.x), abs(p.z));
      dens *= smoothstep(uClipHalf, uClipHalf - 14000.0, edge);
    }

    if (dens > 0.008) {
      if (!gotHit) { hitDist = t; gotHit = true; }
      float h = clamp((p.y - 950.0) / 11850.0, 0.0, 1.0);
      float topH = fld.y;
      float eyewall = fld.z;
      float cirrus = fld.w;

      // Deeper 3D Beer-Lambert directional sun self-shadowing (floored at 0.24 so cloud skirts never turn into dark noise!)
      float occ = 0.0;
      occ += evalDensityFast(p + uSunDir * 1400.0) * 1.35;
      occ += evalDensityFast(p + uSunDir * 3800.0) * 2.15;
      ${shadowTaps > 2 ? 'occ += evalDensityFast(p + uSunDir * 7800.0) * 1.85;' : ''}
      float sunTrans = mix(0.24, 1.0, exp(-occ * 1.55));
      // Multiple-scattering powder effect keeps cloud tops sculptural without clipping to flat white
      float powder = 0.42 + 0.58 * (1.0 - exp(-dens * 3.4));
      float heightAO = smoothstep(0.0, 0.82, h / max(topH, 0.22));
      // Preserve real Beer-Lambert 3D self-shadowing on the stadium wall so ground views show sculpted billowing cloud towers!
      float eyeSpill = eyewall * (0.20 + 0.35 * h);
      float underSculpt = mix(1.0, 0.38 + 1.05 * texture2D(tNoise, (p.xz - uEyePos) / 14000.0 + vec2(h * 0.4, -h * 0.3)).r, lookUpBoost * (1.0 - heightAO * 0.6));

      vec3 cloudAlbedo = mix(vec3(0.46, 0.53, 0.64), vec3(0.95, 0.965, 0.99), smoothstep(0.06, 0.74, h));
      cloudAlbedo = mix(cloudAlbedo, vec3(0.98, 0.99, 1.0), cirrus * 0.75);

      vec3 ambLight = uSky * mix((0.58 + 0.28 * lookUpBoost) * underSculpt, 1.15, heightAO) + uBounce * (1.0 - heightAO) * 0.55;
      vec3 sunLight = uSunCol * 0.80 * max(sunTrans, eyeSpill * 0.22) * phase * powder * mix(0.24 + 0.22 * eyeSpill, 1.08, heightAO);
      vec3 lit = cloudAlbedo * (ambLight + sunLight);

      // Internal 3D eyewall lightning flashes illuminating thick clouds from inside
      float flashSum = 0.0;
      for (int k = 0; k < 6; k++) {
        vec4 fl = uFlashes[k];
        if (fl.w > 0.01) {
          vec3 df = p - fl.xyz;
          float d2 = dot(df.xz, df.xz) + df.y * df.y * 2.0;
          flashSum += fl.w * exp(-d2 / (5200.0 * 5200.0));
        }
      }
      if (flashSum > 0.004) {
        vec3 flashCol = mix(vec3(0.36, 0.70, 1.0), vec3(0.92, 0.98, 1.0), clamp(flashSum * 0.75, 0.0, 1.0));
        lit += flashCol * flashSum * (0.65 + 0.85 * dens) * 2.5;
      }

      // Higher optical extinction so the CDO & overlapping spiral bands form a genuinely solid white cloud continent!
      float stepA = 1.0 - exp(-dens * dt * 0.00088);
      accum += trans * stepA * lit;
      trans *= (1.0 - stepA);
      if (trans < 0.02) break;
    }
    t += dt;
  }

  float alpha = 1.0 - trans;
  if (alpha < 0.01) discard;

  ${tabletop ? '' : `
  float fog = 1.0 - exp(-uFogD * uFogD * hitDist * hitDist);
  accum = mix(accum, uFogCol * alpha, fog);
  `}
  gl_FragColor = vec4(accum, alpha);
}
`;
}

// Create the single-draw-call 3D volumetric raymarched hurricane mesh!
export function createHurricaneCloudMesh({
  tNoise,
  tD = null,
  size = 84000,
  nd = 2048,
  tabletop = false,
  steps = tabletop ? 24 : 38,
  vertScale = tabletop ? 2.6 : 1.0,
  maxRadius = tabletop ? 118000 : 150000,
  clipHalf = tabletop ? 120000 : 1e9,
} = {}) {
  const geom = buildHurricaneShellGeometry({ maxRadius, minHeight: -150, maxHeight: 13200 });

  const uniforms = {
    tNoise: { value: tNoise },
    tD: { value: tD || tNoise },
    uSize: { value: size },
    uND: { value: nd },
    uTerrainClip: { value: 0.0 },
    uInvModel: { value: new THREE.Matrix4() },
    uEyePos: { value: new THREE.Vector2(0, 0) },
    uEyeR: { value: 7800 },
    uStormInt: { value: 1.0 },
    uTime: { value: 0 },
    uExag: { value: 1.5 },
    uVertScale: { value: vertScale },
    uMaxR: { value: maxRadius },
    uClipHalf: { value: clipHalf },
    uFogD: { value: 0.000009 },
    uFogCol: { value: new THREE.Color(0xaec6da) },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.6, -0.6).normalize() },
    uSunCol: { value: new THREE.Color(1.0, 0.96, 0.90).multiplyScalar(1.35) },
    uSky: { value: new THREE.Color(0.38, 0.46, 0.56) },
    uBounce: { value: new THREE.Color(0.10, 0.16, 0.24) },
    uFlashes: {
      value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 5000, 0, 0)),
    },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HURRICANE_VOL_VS,
    fragmentShader: buildHurricaneFS({ tabletop, steps }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  // Outside/above hurricane: FrontSide + depthTest=true (preserves Quest 3 bare-hand occlusion!).
  // Inside/below hurricane (standing on Dominica, Roseau, Morne Diablotins, flying through eye):
  // BackSide + depthTest=false + exact GPU heightmap terrain/ocean ray clipping.
  const updateCameraSide = (camLocal, invModelMat = null) => {
    if (invModelMat) uniforms.uInvModel.value.copy(invModelMat);
    const cloudExag = uniforms.uVertScale.value * (1 + (uniforms.uExag.value - 1) * 0.35);
    const cy = camLocal.y / cloudExag;
    const dx = camLocal.x - uniforms.uEyePos.value.x;
    const dz = camLocal.z - uniforms.uEyePos.value.y;
    const inside = cy <= 13350 && (dx * dx + dz * dz) <= (maxRadius + 500) * (maxRadius + 500);
    const wantSide = inside ? THREE.BackSide : THREE.FrontSide;
    const wantDepth = tabletop ? true : !inside;
    if (mat.side !== wantSide) mat.side = wantSide;
    if (mat.depthTest !== wantDepth) mat.depthTest = wantDepth;
    uniforms.uTerrainClip.value = (!tabletop && inside && tD) ? 1.0 : 0.0;
  };

  return { mesh, uniforms, geom, mat, updateCameraSide };
}
