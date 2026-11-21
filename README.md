# Category 5 Hurricane · Dominica

Interactive 3D WebGL 2 & Meta Quest 3 WebXR passthrough tabletop visualization of a Category 5 hurricane passing directly over **Dominica** in the Caribbean Sea, calibrated to NHC Tropical Cyclone Report AL152017 (Hurricane Maria, September 18–19, 2017).

**Live site:** https://tothur.github.io/dominica-hurricane/

## Features
- **Real Topography & Satellite Imagery**: 84 × 84 km Copernicus GLO-30 16-bit elevation model (`2048×2048`) and EOX Sentinel-2 cloudless 4K imagery of Dominica (Morne Diablotins 1,447 m, Morne Trois Pitons 1,387 m, Roseau, Portsmouth, La Plaine) and the surrounding Caribbean Sea & Atlantic Ocean.
- **True 3D Volumetric Raymarched Hurricane**: Single-draw-call 3D volumetric cloud shield (150 km dense Central Dense Overcast, ~16 km stadium-effect eye, overlapping spiral ridges, radiating anticyclonic cirrus outflow, Beer-Lambert sun self-shadowing, and internal eyewall lightning) with exact GPU heightmap mountain occlusion for ground-level & island views.
- **15-Hour Scrubbable Passage**: 8 deterministic meteorological stages (*Outer Rainbands → Tropical-Storm Squalls → Front Eyewall Strike → Direct Eye Passage → Rear Eyewall Reversal → Feeder Bands & Flash Flooding → Storm Departure → Clearing Skies & Runoff*).
- **Meta Quest 3 Passthrough MR**: Desk hit-test placement, 25-joint bare-hand depth occlusion, direct 1- & 2-hand pinch/grab move/scale/rotate, curved corner resizers, compass turntable, and spatial timeline controls.

## Local Development & Tests
```bash
node --test tests/*.test.mjs
python3 -m http.server 8788
```

## Data Credits
- **Elevation**: Copernicus GLO-30 © DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA.
- **Imagery**: Sentinel-2 cloudless 2020 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020), CC BY-NC-SA 4.0.
