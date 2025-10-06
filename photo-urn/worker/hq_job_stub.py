"""
HQ Mesh Generation Worker (stub)

Use Python + trimesh/open3d/pyembree/libigl + OpenCV:
- Load user image
- Build height map (edges + depth inference if desired)
- Generate relief mesh with adaptive smoothing
- Conform to urn target surface (flat/convex/cylindrical)
- Boolean union with urn model (use voxel fallback if exact fails)
- Validate and export final STL

This file is a stub and includes function outlines to implement.
"""
from dataclasses import dataclass

@dataclass
class Target:
    width_mm: float
    height_mm: float
    depth_mm_min: float
    depth_mm_max: float
    surface: str  # 'flat' | 'convex' | 'cylindrical'
    radius_mm: float | None = None

def run_hq_job(image_path: str, urn_stl_path: str, target: Target, out_stl_path: str):
    # TODO: implement real pipeline
    # 1) preprocess image
    # 2) heightmap
    # 3) mesh from heightmap
    # 4) wrap to surface
    # 5) boolean union
    # 6) validate + export
    pass
