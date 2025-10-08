"use client";

// ThreePreview renders a 3D urn preview using React Three Fiber.  It loads
// an STL model, fits a perspective camera around it, and optionally
// overlays a relief generated from a user image.  The relief always
// sits flush against the urn, and the camera supports free rotation,
// zoom and pan.  The control overlay never blocks pointer events on the
// canvas.

import React, {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
// Import OrbitControls directly from Three.js examples instead of @react-three/drei.
// Using the example controls avoids requiring the drei package, which may not be
// installed in the target environment.  We will wrap these controls in a
// custom component below to integrate with react-three-fiber.
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three-stdlib';
import { useAppStore } from '@/lib/store';
import urns from '@/lib/urns/urns.json';

// Define the six faces of a cube that the relief can attach to.
type FaceCode = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

/**
 * Resolve an STL filename into an absolute path.  If the string is
 * already a URL or starts with a slash it is returned unchanged.
 */
function resolveSTL(p: string): string {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return p;
  if (p.includes('/')) return `/${p}`;
  return `/urns/${p}`;
}

/**
 * Fit a perspective camera to a bounding box with optional padding.  The
 * camera is positioned, near/far planes are set, and OrbitControls are
 * updated so the urn remains in view while still allowing orbit.
 */
function simpleFit(
  camera: THREE.PerspectiveCamera,
  controls: any,
  bbox: THREE.Box3,
  paddingK = 2.0,
): void {
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const diag = size.length() || 1;
  const dir = new THREE.Vector3(1, 1.05, 1).normalize();
  const dist = diag * paddingK;
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.lookAt(center);
  camera.near = Math.max(diag / 500, 0.001);
  camera.far = Math.max(diag * 50, 10);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(center);
    controls.minDistance = diag * 0.35;
    controls.maxDistance = diag * 6.0;
    controls.update();
  }
}

/**
 * Return the width (u) and height (v) of a given face of the bounding
 * box.  These values are used to size the relief plane.
 */
function faceSizeFor(bbox: THREE.Box3, face: FaceCode): { u: number; v: number } {
  const s = new THREE.Vector3();
  bbox.getSize(s);
  switch (face) {
    case '+X':
    case '-X':
      return { u: s.z, v: s.y };
    case '+Y':
    case '-Y':
      return { u: s.x, v: s.z };
    case '+Z':
    case '-Z':
    default:
      return { u: s.x, v: s.y };
  }
}

/**
 * Compute a position and orientation for a relief plane attached to one
 * face of the bounding box.  The plane’s local +Z points outwards and
 * the local +Y stays aligned with the chosen face up-vector.  The
 * returned `targetW` and `targetH` describe the face dimensions before
 * scaling.
 */
function facePlacement(bbox: THREE.Box3, face: FaceCode) {
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const eps = 0.0006;
  const pos = center.clone();
  const normal = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let targetW = size.x;
  let targetH = size.y;
  switch (face) {
    case '+X':
      pos.x = bbox.max.x + eps;
      rot.set(0, Math.PI / 2, 0);
      targetW = size.z;
      targetH = size.y;
      break;
    case '-X':
      pos.x = bbox.min.x - eps;
      rot.set(0, -Math.PI / 2, 0);
      targetW = size.z;
      targetH = size.y;
      break;
    case '+Y':
      pos.y = bbox.max.y + eps;
      rot.set(-Math.PI / 2, 0, 0);
      targetW = size.x;
      targetH = size.z;
      break;
    case '-Y':
      pos.y = bbox.min.y - eps;
      rot.set(Math.PI / 2, 0, 0);
      targetW = size.x;
      targetH = size.z;
      break;
    case '+Z':
      pos.z = bbox.max.z + eps;
      normal.set(0, 0, 1);
      up.set(0, 1, 0);
      targetW = size.x;
      targetH = size.y;
      break;
    case '-Z':
      pos.z = bbox.min.z - eps;
      normal.set(0, 0, -1);
      up.set(0, 1, 0);
      targetW = size.x;
      targetH = size.y;
      break;
    default:
      break;
  }
  const right = new THREE.Vector3().crossVectors(up, normal);
  if (right.lengthSq() < 1e-12) {
    // Fallback in the unlikely event that up and normal are parallel.
    right.set(1, 0, 0).cross(normal);
  }
  right.normalize();
  up.crossVectors(normal, right).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, up, normal);
  const quat = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return { pos, quat, targetW, targetH };
}

/**
 * Generate displacement and normal maps from an image.  The image’s
 * luminance is normalized, blurred, sharpened, gamma corrected and
 * contrast boosted.  A CanvasTexture stores the displacement map and
 * a DataTexture stores the normal map.
 */
async function buildMaps(url: string) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const w = Math.min(1024, (img as any).naturalWidth || (img as any).width || 1024);
  const h = Math.min(1024, (img as any).naturalHeight || (img as any).height || 1024);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    lum[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const sorted = Float32Array.from(lum).sort();
  const p = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
  const lo = p(0.04);
  const hi = p(0.96);
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / span));
  }
  const tmp = new Float32Array(lum.length);
  const blur = new Float32Array(lum.length);
  const kernel = [1, 4, 6, 4, 1];
  const kernelSum = 16;
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) {
        const ix = Math.min(w - 1, Math.max(0, x + k));
        acc += lum[y * w + ix] * kernel[k + 2];
      }
      tmp[y * w + x] = acc / kernelSum;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) {
        const iy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[iy * w + x] * kernel[k + 2];
      }
      blur[y * w + x] = acc / kernelSum;
    }
  }
  for (let i = 0; i < lum.length; i++) {
    const hp = lum[i] - blur[i];
    let v = lum[i] + 1.2 * hp;
    v = Math.min(1, Math.max(0, v));
    v = Math.pow(v, 0.85);
    v = v * v * (3 - 2 * v);
    lum[i] = Math.min(1, v * 1.5);
  }
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = w;
  dispCanvas.height = h;
  const dispCtx = dispCanvas.getContext('2d')!;
  const dispImg = dispCtx.createImageData(w, h);
  for (let i = 0, j = 0; i < dispImg.data.length; i += 4, j++) {
    const v = Math.round(lum[j] * 255);
    dispImg.data[i] = v;
    dispImg.data[i + 1] = v;
    dispImg.data[i + 2] = v;
    dispImg.data[i + 3] = 255;
  }
  dispCtx.putImageData(dispImg, 0, 0);
  const dispTex = new THREE.CanvasTexture(dispCanvas);
  dispTex.needsUpdate = true;
  dispTex.minFilter = THREE.LinearFilter;
  dispTex.magFilter = THREE.LinearFilter;
  // normal map
  const idx = (xx: number, yy: number) =>
    Math.min(w - 1, Math.max(0, xx)) + Math.min(h - 1, Math.max(0, yy)) * w;
  const normData = new Uint8Array(w * h * 3);
  for (let y = 0, q = 0; y < h; y++) {
    for (let x = 0; x < w; x++, q += 3) {
      const tl = lum[idx(x - 1, y - 1)];
      const t = lum[idx(x, y - 1)];
      const tr = lum[idx(x + 1, y - 1)];
      const l = lum[idx(x - 1, y)];
      const r = lum[idx(x + 1, y)];
      const bl = lum[idx(x - 1, y + 1)];
      const b = lum[idx(x, y + 1)];
      const br = lum[idx(x + 1, y + 1)];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      const nx = -gx * 2.2;
      const ny = -gy * 2.2;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      normData[q] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normData[q + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normData[q + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
    }
  }
  const normTex = new THREE.DataTexture(normData, w, h, THREE.RGBFormat);
  normTex.needsUpdate = true;
  normTex.minFilter = THREE.LinearFilter;
  normTex.magFilter = THREE.LinearFilter;
  return { disp: dispTex, normal: normTex };
}

/**
 * Load an STL model and prepare a mesh.  The bounding box is used to
 * determine scaling: if the largest dimension is > 3 units, the model
 * is assumed to be in millimetres and scaled down to metres.  The
 * optional orientation applies rotations (degrees) and mirroring along
 * axes.  onReady receives the bounding box, scale, and transform.
 */
function UrnMesh(props: {
  stlPath: string;
  orientation?: {
    rotate_deg?: { x: number; y: number; z: number };
    mirror?: { x: boolean; y: boolean; z: boolean };
  };
  onReady: (info: { bbox: THREE.Box3; scale: number; matrix: THREE.Matrix4 }) => void;
  onError: (e: any) => void;
}) {
  const { stlPath, orientation, onReady, onError } = props;
  const [geometry, setGeometry] = useState<any>(null);
  const [scale, setScale] = useState(1);
  const [matrix, setMatrix] = useState(new THREE.Matrix4());
  useEffect(() => {
    let mounted = true;
    const loader = new STLLoader();
    loader.load(
      stlPath,
      (g) => {
        if (!mounted) return;
        try {
          g.computeVertexNormals();
          g.computeBoundingBox();
          const bbox = g.boundingBox ?? new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as any);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const largest = Math.max(size.x, size.y, size.z);
          const scl = largest > 3 ? 0.001 : 1;
          setScale(scl);
          const rot = new THREE.Euler(
            THREE.MathUtils.degToRad(orientation?.rotate_deg?.x ?? 0),
            THREE.MathUtils.degToRad(orientation?.rotate_deg?.y ?? 0),
            THREE.MathUtils.degToRad(orientation?.rotate_deg?.z ?? 0),
            'XYZ',
          );
          const mir = orientation?.mirror ?? { x: false, y: false, z: false };
          const mat = new THREE.Matrix4()
            .multiply(new THREE.Matrix4().makeRotationFromEuler(rot))
            .multiply(
              new THREE.Matrix4().makeScale(
                mir.x ? -1 : 1,
                mir.y ? -1 : 1,
                mir.z ? -1 : 1,
              ),
            );
          setMatrix(mat);
          onReady({ bbox, scale: scl, matrix: mat });
          setGeometry(g);
        } catch (e) {
          onError(e);
        }
      },
      undefined,
      (err) => onError(err),
    );
    return () => {
      mounted = false;
    };
  }, [stlPath, orientation, onReady, onError]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xb5b5b5,
        metalness: 0.35,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
    [],
  );
  if (!geometry) return null;
  return (
    <group scale={scale}>
      <group matrixAutoUpdate={false} matrix={matrix}>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
      </group>
    </group>
  );
}

/**
 * ReliefPlane renders a subdivided plane with displacement and normal
 * maps derived from the user image.  Displacement is scaled by a
 * user‑supplied boost factor and can be inverted.  The plane uses
 * zero bias so the back stays flush to the urn; a small offset along
 * +Z avoids z‑fighting.  Additional transforms (rotation, flips,
 * offsets) are applied per frame.
 */
function ReliefPlane(props: {
  image: string;
  params: any;
  target: any;
  faceBoxMeters: { w: number; h: number };
  autoRotateZDeg: number;
  faceNudgeMm?: { x: number; y: number };
}) {
  const { image, params, target, faceBoxMeters, autoRotateZDeg, faceNudgeMm } = props;
  const [maps, setMaps] = useState<any>(null);
  useEffect(() => {
    let live = true;
    if (!image) {
      setMaps(null);
      return;
    }
    (async () => {
      try {
        const mm = await buildMaps(image);
        if (live) setMaps(mm);
      } catch {
        if (live) setMaps(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [image]);
  const depthM = Math.abs((params?.depth ?? 3.0) / 1000);
  const boost = params?.boost ?? 6;
  const invertSign = params?.invert ? -1 : 1;
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.08,
        roughness: 0.42,
        displacementMap: maps?.disp ?? null,
        displacementScale: depthM * boost * invertSign,
        displacementBias: 0,
        normalMap: maps?.normal ?? null,
        normalScale: new THREE.Vector2(8.0, 8.0),
        side: THREE.DoubleSide,
      }),
    [maps, depthM, boost, invertSign],
  );
  const designW = (target?.width_mm ?? 100) / 1000;
  const designH = (target?.height_mm ?? 120) / 1000;
  const rotated = autoRotateZDeg === 90 ? { w: designH, h: designW } : { w: designW, h: designH };
  const margin = 0.002;
  const availW = Math.max(0, faceBoxMeters.w - margin);
  const availH = Math.max(0, faceBoxMeters.h - margin);
  const s = Math.min(availW / rotated.w, availH / rotated.h, 1.0);
  const userScale = params?.scale ?? 1;
  const planeW = rotated.w * s * userScale;
  const planeH = rotated.h * s * userScale;
  const meshRef = useRef<any>(null);
  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const zAuto = autoRotateZDeg * (Math.PI / 180);
    const zUser = (params?.rotation ?? 0) * (Math.PI / 180);
    const zExtra = ((params?.imageRotateDeg ?? 0) % 360) * (Math.PI / 180);
    m.rotation.z = zAuto + zUser + zExtra;
    m.scale.x = params?.flipX ? -1 : 1;
    m.scale.y = params?.flipY ? -1 : 1;
    m.position.x = ((params?.offsetX ?? 0) + (faceNudgeMm?.x ?? 0)) / 1000;
    m.position.y = ((params?.offsetY ?? 0) + (faceNudgeMm?.y ?? 0)) / 1000;
    m.position.z = 0.0004;
  });
  return (
    <mesh ref={meshRef} material={material} castShadow receiveShadow>
      <planeGeometry args={[planeW, planeH, 1024, 1024]} />
    </mesh>
  );
}

/**
 * Main ThreePreview component.  It loads the urn based on the selected
 * ID from the app store, fits the camera, displays UI controls, and
 * renders the relief plane when an image is provided.  A Reset
 * button allows refitting the camera.
 */
export default function ThreePreview() {
  const { urnId, imageDataUrl, params } = useAppStore((s) => ({
    urnId: s.urnId,
    imageDataUrl: s.imageDataUrl,
    params: s.params,
  }));
  const urn: any = urnId ? (urns as any)[urnId] : null;
  const [bbox, setBbox] = useState<any>(null);
  const [urnScale, setUrnScale] = useState(1);
  const [face, setFace] = useState<FaceCode | null>(null);
  const [faceNudge, setFaceNudge] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [stlError, setStlError] = useState<string | null>(null);
  const containerRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  // Choose which face to use for the relief.  Default from urn metadata.
  const defaultFace: FaceCode = (urn?.target?.default_face ?? '+Y') as FaceCode;
  const requestedFace: FaceCode = (face ?? defaultFace) as FaceCode;
  // Compute available face area in metres.
  let faceBoxMeters = { w: 0.1, h: 0.1 };
  if (bbox) {
    const fs = faceSizeFor(bbox, requestedFace);
    faceBoxMeters = { w: fs.u * urnScale, h: fs.v * urnScale };
  }
  // Determine whether rotating the design by 90° yields a better fit.
  const targetWm = (urn?.target?.width_mm ?? 100) / 1000;
  const targetHm = (urn?.target?.height_mm ?? 120) / 1000;
  const margin = 0.002;
  const fit0 = Math.min((faceBoxMeters.w - margin) / targetWm, (faceBoxMeters.h - margin) / targetHm);
  const fit90 = Math.min((faceBoxMeters.w - margin) / targetHm, (faceBoxMeters.h - margin) / targetWm);
  const autoRotateZDeg = isFinite(fit90) && fit90 > fit0 ? 90 : 0;
  // Reset camera to fit urn.
  const doRefit = useCallback(() => {
    if (!bbox || !controlsRef.current) return;
    const cam = (controlsRef.current as any).object as THREE.PerspectiveCamera;
    const scaled = bbox.clone();
    scaled.min.multiplyScalar(urnScale);
    scaled.max.multiplyScalar(urnScale);
    simpleFit(cam, controlsRef.current, scaled, 2.0);
  }, [bbox, urnScale]);
  // Fitter component fits the camera whenever bbox or scale changes.
  const Fitter = () => {
    const { camera } = useThree();
    useEffect(() => {
      if (!bbox || !(camera instanceof THREE.PerspectiveCamera)) return;
      const scaled = bbox.clone();
      scaled.min.multiplyScalar(urnScale);
      scaled.max.multiplyScalar(urnScale);
      simpleFit(camera as THREE.PerspectiveCamera, controlsRef.current, scaled, 2.0);
    }, [bbox, urnScale, camera]);
    return null;
  };
  const ControlUpdater = () => {
    useFrame(() => {
      const controls = controlsRef.current;
      if (controls && typeof controls.update === 'function') {
        controls.update();
      }
    });
    return null;
  };
  return (
    <div
      ref={containerRef}
      className="relative w-full h-[520px] rounded-xl overflow-hidden border border-neutral-200"
    >
      {/* Overlay controls; pointer-events-none prevents blocking the canvas. */}
      <div className="absolute left-2 top-2 z-10 pointer-events-none">
        <div className="flex flex-col gap-1">
          <button
            onClick={doRefit}
            className="text-xs px-2 py-1 bg-white/90 border rounded shadow pointer-events-auto"
          >
            Reset View
          </button>
          <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-md border text-xs flex items-center gap-1 pointer-events-auto">
            <span>Face</span>
            <select
              className="border rounded px-1 py-0.5"
              value={requestedFace}
              onChange={(e) => setFace(e.target.value as FaceCode)}
            >
              {['+X', '-X', '+Y', '-Y', '+Z', '-Z'].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="ml-2">nudge (mm)</span>
            <input
              type="number"
              step="0.5"
              className="w-14 border rounded px-1 py-0.5"
              value={faceNudge.x}
              onChange={(e) => setFaceNudge((v) => ({ ...v, x: parseFloat(e.target.value || '0') }))}
            />
            <input
              type="number"
              step="0.5"
              className="w-14 border rounded px-1 py-0.5"
              value={faceNudge.y}
              onChange={(e) => setFaceNudge((v) => ({ ...v, y: parseFloat(e.target.value || '0') }))}
            />
          </div>
        </div>
      </div>
      <Canvas
        key={urnId || 'no-urn'}
        shadows
        camera={{ fov: 44 }}
        eventSource={containerRef}
        eventPrefix="client"
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      >
        {/* Background colour */}
        <color attach="background" args={['#f6f6f6']} />
        {/* Lights */}
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[3, 5, 6]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-3.2, -2, 4.2]} intensity={0.9} />
        <hemisphereLight intensity={0.4} groundColor={new THREE.Color(0x404040)} />
        {/* Urn mesh */}
        {urn && urn.stl && (
          <UrnMesh
            stlPath={resolveSTL(urn.stl)}
            orientation={urn.orientation}
            onReady={({ bbox, scale }) => {
              setBbox(bbox);
              setUrnScale(scale);
              setStlError(null);
            }}
            onError={(e) => setStlError(String(e))}
          />
        )}
        {/* Fit camera */}
        <Fitter />
        {/* Relief plane */}
        {urn && imageDataUrl && bbox && (() => {
          const { pos, quat, targetW, targetH } = facePlacement(bbox, requestedFace);
          return (
            <group position={[pos.x * urnScale, pos.y * urnScale, pos.z * urnScale]} quaternion={quat}>
              <ReliefPlane
                image={imageDataUrl}
                params={params}
                target={urn.target}
                faceBoxMeters={{ w: targetW * urnScale, h: targetH * urnScale }}
                autoRotateZDeg={autoRotateZDeg}
                faceNudgeMm={faceNudge}
              />
            </group>
          );
        })()}
        {/* Orbit controls imported from @react-three/drei.  makeDefault
            registers this instance as the default controls so that
            react-three-fiber uses it for event handling. */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.12}
          enableRotate
          enableZoom
          enablePan
        />
        <ControlUpdater />
      </Canvas>
      {/* Display STL errors if any */}
      {stlError && (
        <div className="absolute left-2 bottom-2 text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 pointer-events-auto">
          STL error (see console): {String(stlError)}
        </div>
      )}
    </div>
  );
}