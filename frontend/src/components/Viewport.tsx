/**
 * 3D Viewport — renders STL models using react-three-fiber.
 *
 * Features:
 *   - Loads STL from backend URL via STLLoader
 *   - Orbit/zoom/pan controls (drei OrbitControls)
 *   - Grid helper + lighting
 *   - Auto-fits camera to model bounding box on load
 *   - Loading spinner and empty state
 *   - Reloads STL when stlRevision changes (after recompile)
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { stlUrl } from "../api/client";

/** Inner component that loads and renders the STL geometry */
function STLModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  // Load STL manually (not via useLoader) so we can reload on URL change
  useEffect(() => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geo) => {
        setGeometry(geo);
      },
      undefined,
      (err) => {
        console.error("STL load error:", err);
      }
    );
  }, [url]);

  // Auto-fit camera to model bounds
  useEffect(() => {
    if (!geometry) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.5,
      center.z + distance
    );
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [geometry, camera]);

  if (!geometry) return null;

  return (
    <Center>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial color="#6d9eeb" metalness={0.3} roughness={0.5} />
      </mesh>
    </Center>
  );
}

/** Loading spinner overlay */
function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 z-10">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
        <span className="text-zinc-400 text-sm">Compiling model...</span>
      </div>
    </div>
  );
}

interface ViewportProps {
  stlPath: string | null;
  loading: boolean;
  recompiling: boolean;
  /** Revision counter — changes on every compile/recompile to force STL reload */
  stlRevision: number;
}

export default function Viewport({ stlPath, loading, recompiling, stlRevision }: ViewportProps) {
  // Build URL with revision as cache-buster so the browser/loader fetches fresh STL
  const fullUrl = stlPath ? `${stlUrl(stlPath)}?rev=${stlRevision}` : null;

  return (
    <div className="relative w-full h-full bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
      {(loading || recompiling) && <LoadingOverlay />}

      {!stlPath && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-zinc-500 text-lg">Enter a prompt to generate a 3D model</p>
        </div>
      )}

      <Canvas camera={{ position: [50, 50, 100], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 15]} intensity={1} />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />
        <gridHelper args={[200, 20, "#444444", "#333333"]} />

        {fullUrl && (
          <Suspense fallback={null}>
            <STLModel url={fullUrl} />
          </Suspense>
        )}

        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          minDistance={5}
          maxDistance={500}
        />
      </Canvas>
    </div>
  );
}
