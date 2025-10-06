import os, json, time
import numpy as np
from PIL import Image
import cv2, trimesh
from scipy.ndimage import sobel

def estimate_depth_stub(rgb):
    # TODO: replace with Depth Anything V2
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gray = (gray - gray.min()) / max(1e-6, gray.max() - gray.min())
    return 1.0 - gray

def make_relief(depth, w_mm, h_mm, d_mm, out_path):
    H, W = depth.shape
    xs = np.linspace(-w_mm/2, w_mm/2, W)
    ys = np.linspace(-h_mm/2, h_mm/2, H)
    xv, yv = np.meshgrid(xs, ys)
    zv = depth * d_mm
    verts = np.stack([xv, yv, zv], axis=-1).reshape(-1, 3)
    faces = []
    for y in range(H-1):
        for x in range(W-1):
            i = y*W + x
            faces.append([i, i+1, i+W])
            faces.append([i+1, i+W+1, i+W])
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    mesh.export(out_path)

def process(job_path):
    with open(job_path, 'r') as f:
        job = json.load(f)
    outdir = job['outDir']
    os.makedirs(outdir, exist_ok=True)

    rgb = np.array(Image.open(job['imagePath']).convert('RGB'))
    depth = estimate_depth_stub(rgb)

    Image.fromarray((depth*255).astype(np.uint8)).save(os.path.join(outdir, 'depth.png'))

    make_relief(depth, 120, 120, float(job['params'].get('depth', 2.0)), os.path.join(outdir, 'relief_only.stl'))

    # Placeholder final urn = just copy
    import shutil
    shutil.copy(os.path.join(outdir, 'relief_only.stl'), os.path.join(outdir, 'urn_final.stl'))

    print("Job done:", job['orderId'])

def main():
    jobs_dir = os.path.join(os.getcwd(), '.jobs')
    os.makedirs(jobs_dir, exist_ok=True)
    print("Worker watching", jobs_dir)
    while True:
        for name in os.listdir(jobs_dir):
            if not name.endswith('.json'): continue
            path = os.path.join(jobs_dir, name)
            try:
                process(path)
            except Exception as e:
                print("Job error:", e)
            os.remove(path)
        time.sleep(2)

if __name__ == "__main__":
    main()
