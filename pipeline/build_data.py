"""Build real Copernicus GLO-30 DEM + EOX Sentinel-2 cloudless 4K imagery for Dominica (Caribbean)."""
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage

WORK = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(f'{WORK}/raw', exist_ok=True)
os.makedirs(OUT, exist_ok=True)

# 84 km x 84 km square centered on Dominica (15.42N, 61.35W)
# Shows the full mountainous island (47 km N-S x 26 km E-W) surrounded by open Caribbean Sea & Atlantic Ocean
LATC = 15.42
LONC = -61.35
SIZE = 84000.0
MLAT = 110650.0
MLON = 111320.0 * math.cos(math.radians(LATC))

# 1. Download Copernicus GLO-30 tile N15_W062 (covers 15..16N, 62..61W -> 100% of Dominica!)
dem_tif = f'{WORK}/raw/N15_W062.tif'
if not os.path.exists(dem_tif) or os.path.getsize(dem_tif) < 100000:
    url = (
        'https://copernicus-dem-30m.s3.amazonaws.com/'
        'Copernicus_DSM_COG_10_N15_00_W062_00_DEM/'
        'Copernicus_DSM_COG_10_N15_00_W062_00_DEM.tif'
    )
    print(f'Downloading Copernicus GLO-30 DEM for Dominica ({url})...', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'HurricaneTabletopViz/1.0'})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dem_tif, 'wb') as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    print(f'Downloaded DEM: {os.path.getsize(dem_tif):,} bytes', flush=True)

# 2. Sample 2048x2048 metric height grid (anything east of 61W is open Atlantic Ocean = 0 m)
N = 2048
cell = SIZE / (N - 1)
idx = np.arange(N) - (N - 1) / 2.0
lon = LONC + idx * cell / MLON
lat = LATC - idx * cell / MLAT

raw = tifffile.imread(dem_tif).astype(np.float64)
raw = np.nan_to_num(raw, nan=0.0)
# Copernicus N15_W062 spans lon [-62, -61), lat (15, 16] at 1/3600 deg spacing
px = (lon - (-62.0)) * 3600.0
py = (16.0 - lat) * 3600.0
PX, PY = np.meshgrid(px, py)
in_tile = (PX >= 0) & (PX <= raw.shape[1] - 1) & (PY >= 0) & (PY <= raw.shape[0] - 1)
D = ndimage.map_coordinates(raw, [np.clip(PY, 0, raw.shape[0] - 1), np.clip(PX, 0, raw.shape[1] - 1)], order=3, mode='nearest')
D = np.where(in_tile, np.maximum(D, 0.0), 0.0).astype(np.float32)

r_max, c_max = np.unravel_index(np.argmax(D), D.shape)
print(
    f'DEM grid {N}x{N} ({SIZE/1000:.1f} km, cell={cell:.1f} m): '
    f'max={D.max():.1f} m at ({lat[r_max]:.4f}N, {lon[c_max]:.4f}W)',
    flush=True,
)

# Encode 16-bit PNG heightmap (RG channels)
q_offset = -20.0
q_scale = 32.0  # covers -20 m .. +2027 m at 3.1 cm vertical precision
q_vals = np.clip(np.round((D - q_offset) * q_scale), 0, 65535).astype(np.uint16)
d_rgba = np.zeros((N, N, 4), dtype=np.uint8)
d_rgba[:, :, 0] = (q_vals >> 8).astype(np.uint8)
d_rgba[:, :, 1] = (q_vals & 0xFF).astype(np.uint8)
d_rgba[:, :, 3] = 255
Image.fromarray(d_rgba, mode='RGBA').save(f'{OUT}/d2048.png', optimize=True)
print('Saved d2048.png', flush=True)

# 3. Compute 1024x1024 4-channel auxiliary map (slope, convexity/ridge, roughness, coastal proximity)
NA = 1024
D1 = ndimage.zoom(D, NA / N, order=1)
cell1 = SIZE / (NA - 1)
gy, gx = np.gradient(D1, cell1)
slope = np.clip(np.hypot(gx, gy) / 0.85, 0.0, 1.0)
smooth_d = ndimage.gaussian_filter(D1, sigma=4.0)
ridge = np.clip((D1 - smooth_d) / 140.0 + 0.5, 0.0, 1.0)
rough = np.clip(np.abs(D1 - ndimage.gaussian_filter(D1, sigma=1.6)) / 35.0, 0.0, 1.0)
land_mask = (D1 > 1.2).astype(np.float32)
dist_coast = ndimage.distance_transform_edt(land_mask > 0.5) * cell1
coast_zone = np.where(land_mask > 0.5, np.exp(-dist_coast / 1800.0), 0.0)

aux_channels = [slope, ridge, rough, coast_zone]
aux_ranges = [[0.0, 1.0], [0.0, 1.0], [0.0, 1.0], [0.0, 1.0]]
aux_stack = np.zeros((NA * 4, NA), dtype=np.uint16)
for k, ch in enumerate(aux_channels):
    aux_stack[k * NA:(k + 1) * NA, :] = np.clip(np.round(ch * 65535.0), 0, 65535).astype(np.uint16)
aux_rgba = np.zeros((NA * 4, NA, 4), dtype=np.uint8)
aux_rgba[:, :, 0] = (aux_stack >> 8).astype(np.uint8)
aux_rgba[:, :, 1] = (aux_stack & 0xFF).astype(np.uint8)
aux_rgba[:, :, 3] = 255
Image.fromarray(aux_rgba, mode='RGBA').save(f'{OUT}/aux1024.png', optimize=True)
print('Saved aux1024.png', flush=True)

# 4. Download EOX Sentinel-2 cloudless 2020 tiles (z=12 -> ~18x18 tiles) and stitch 4096x4096 sat.jpg
Z = 12
SW = 4096
n_tiles = 2 ** Z
mx = lambda lo: (lo + 180.0) / 360.0 * n_tiles * 256.0
def my(la):
    r = math.radians(la)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * n_tiles * 256.0

lon_min, lon_max = float(lon.min()), float(lon.max())
lat_min, lat_max = float(lat.min()), float(lat.max())
x0, x1 = int(mx(lon_min) // 256), int(mx(lon_max) // 256)
y0, y1 = int(my(lat_max) // 256), int(my(lat_min) // 256)
os.makedirs(f'{WORK}/raw/sat_{Z}', exist_ok=True)

tasks = []
for tx in range(x0, x1 + 1):
    for ty in range(y0, y1 + 1):
        p = f'{WORK}/raw/sat_{Z}/{tx}_{ty}.jpg'
        if not os.path.exists(p) or os.path.getsize(p) < 500:
            url = f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{Z}/{ty}/{tx}.jpg'
            tasks.append((url, p))

if tasks:
    print(f'Downloading {len(tasks)} Sentinel-2 z={Z} tiles ({x1-x0+1}x{y1-y0+1})...', flush=True)
    def fetch(item):
        url, p = item
        req = urllib.request.Request(url, headers={'User-Agent': 'HurricaneTabletopViz/1.0'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        with open(p, 'wb') as f:
            f.write(data)
    with ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(fetch, tasks))

mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), dtype=np.uint8)
for tx in range(x0, x1 + 1):
    for ty in range(y0, y1 + 1):
        p = f'{WORK}/raw/sat_{Z}/{tx}_{ty}.jpg'
        mos[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = np.asarray(
            Image.open(p).convert('RGB')
        )

u = np.arange(SW) / (SW - 1.0)
slon = lon_min + u * (lon_max - lon_min)
slat = lat_max - u * (lat_max - lat_min)
SX, SY = np.meshgrid(
    np.array([mx(v) for v in slon]) - x0 * 256.0 - 0.5,
    np.array([my(v) for v in slat]) - y0 * 256.0 - 0.5,
)
sat = np.stack([ndimage.map_coordinates(mos[:, :, c].astype(np.float32), [SY, SX], order=1) for c in range(3)], -1)
Image.fromarray(np.clip(sat, 0, 255).astype(np.uint8)).save(f'{OUT}/sat.jpg', quality=86, optimize=True)
print(f'Saved sat.jpg ({os.path.getsize(f"{OUT}/sat.jpg"):,} bytes)', flush=True)

# 5. Compute exact world coordinates (x, z) for Dominica landmarks
def ll_to_xz(la, lo):
    return [round((lo - LONC) * MLON, 1), round((LATC - la) * MLAT, 1)]

def h_at(la, lo):
    fx = np.clip((lo - lon_min) / (lon_max - lon_min), 0, 1) * (N - 1)
    fz = np.clip((lat_max - la) / (lat_max - lat_min), 0, 1) * (N - 1)
    return round(float(D[int(round(fz)), int(round(fx))]), 1)

landmarks = [
    dict(name='Morne Diablotins (1,447 m)', major=True, pos=ll_to_xz(15.5028, -61.3975), h=h_at(15.5028, -61.3975), lift=240),
    dict(name='Morne Trois Pitons (1,387 m)', major=True, pos=ll_to_xz(15.3711, -61.3292), h=h_at(15.3711, -61.3292), lift=200),
    dict(name='Roseau (Capital)', major=True, pos=ll_to_xz(15.3017, -61.3881), h=h_at(15.3017, -61.3881), lift=160),
    dict(name='Portsmouth', major=False, pos=ll_to_xz(15.5833, -61.4600), h=h_at(15.5833, -61.4600), lift=140),
    dict(name='Marigot', major=False, pos=ll_to_xz(15.5333, -61.2833), h=h_at(15.5333, -61.2833), lift=140),
    dict(name='La Plaine (Landfall)', major=False, pos=ll_to_xz(15.3315, -61.2470), h=h_at(15.3315, -61.2470), lift=150),
    dict(name='Soufrière Bay', major=False, pos=ll_to_xz(15.2330, -61.3600), h=h_at(15.2330, -61.3600), lift=140),
    dict(name='Caribbean Sea', major=False, pos=ll_to_xz(15.42, -61.62), h=0.0, lift=180),
    dict(name='Atlantic Ocean', major=False, pos=ll_to_xz(15.42, -61.08), h=0.0, lift=180),
]

meta = dict(
    name='Dominica — Category 5 Hurricane',
    size=SIZE,
    center=[0.0, 0.0],
    latc=LATC,
    lonc=LONC,
    q=dict(scale=q_scale, offset=q_offset),
    auxRanges=aux_ranges,
    island=dict(
        peak=ll_to_xz(lat[r_max], lon[c_max]),
        peakHeight=round(float(D.max()), 1),
        landfall=ll_to_xz(15.3315, -61.2470),
        eyeCenter=ll_to_xz(15.405, -61.355),
    ),
    landmarks=landmarks,
)
with open(f'{OUT}/meta.json', 'w') as f:
    json.dump(meta, f, indent=2)
print('Saved meta.json', flush=True)
