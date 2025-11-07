"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";

// Phases: 0..1 timeline that loops
// [0.00 - 0.20] Ground only
// [0.20 - 0.40] Blueprint overlay fades in/out
// [0.40 - 0.70] Construction: foundations + steel frames rise
// [0.70 - 1.00] Skins appear, infrastructure grows; hold finish and crossfade to start

const CYCLE_SECONDS = 22;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function remap(x: number, inMin: number, inMax: number) {
  return clamp01((x - inMin) / (inMax - inMin));
}

function Ground() {
  const planeRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x24301a) });
    mat.roughness = 1.0;
    mat.metalness = 0.0;
    mat.onBeforeCompile = (shader) => {
      // Subtle grass/soil variation
      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
         float noise(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123); }`
      ).replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
         vec2 uv = vUv * 12.0;
         float n = noise(uv) * 0.35 + noise(uv*2.7) * 0.15;
         vec3 soil = vec3(0.16, 0.18, 0.12);
         vec3 grass = vec3(0.18, 0.28, 0.14);
         diffuseColor.rgb = mix(soil, grass, 0.55 + n*0.45);
        `
      );
    };
    return mat;
  }, []);
  return (
    <mesh ref={planeRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function BlueprintOverlay() {
  const gridRef = useRef<THREE.LineSegments>(null);
  const linesGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const step = 4;
    const size = 200;
    const points: number[] = [];
    for (let i = -size; i <= size; i += step) {
      points.push(-size, 0.01, i, size, 0.01, i);
      points.push(i, 0.01, -size, i, 0.01, size);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);

  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(0x4c86ff) }), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const phase = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.2);
    const appear = clamp01(remap(phase, 0.2, 0.4));
    mat.opacity = appear * pulse;
    mat.transparent = true;
  });

  return <lineSegments ref={gridRef} geometry={linesGeom} material={mat} />;
}

function Buildings() {
  const instancedRefSkin = useRef<THREE.InstancedMesh>(null);
  const instancedRefFrame = useRef<THREE.InstancedMesh>(null);
  const instancedRefFoundation = useRef<THREE.InstancedMesh>(null);

  const { footprints, heights } = useMemo(() => {
    const positions: [number, number][] = [];
    const heights: number[] = [];

    // Create blocks with streets
    for (let x = -40; x <= 40; x += 8) {
      for (let z = -40; z <= 40; z += 8) {
        // leave space for roads every 16 units
        if (x % 16 === 0 || z % 16 === 0) continue;
        const jitterX = Math.random() * 1.5 - 0.75;
        const jitterZ = Math.random() * 1.5 - 0.75;
        positions.push([x + jitterX, z + jitterZ]);
        const h = 4 + Math.floor(Math.random() * 18);
        heights.push(h);
      }
    }

    return { footprints: positions, heights } as const;
  }, []);

  const frameColor = new THREE.Color(0x96a5b8);
  const skinColor = new THREE.Color(0x9bb7d9);
  const foundationColor = new THREE.Color(0x9aa3ab);

  useFrame(({ clock }) => {
    if (!instancedRefSkin.current || !instancedRefFrame.current || !instancedRefFoundation.current) return;
    const m = new THREE.Matrix4();

    const t = clock.getElapsedTime();
    const phase = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
    const construct = remap(phase, 0.4, 0.7);
    const finish = remap(phase, 0.7, 1.0);

    // Foundations rise during early construction
    const foundationRise = easeInOut(construct);
    // Frames rise after foundations
    const frameRise = easeInOut(clamp01(construct * 1.1 - 0.15));
    // Skins fade/scale in later
    const skinAppear = easeInOut(finish);

    let i = 0;
    for (const [x, z] of footprints) {
      const height = heights[i];

      // Foundation
      const foundationHeight = Math.max(0.2, 0.6 * foundationRise);
      m.compose(new THREE.Vector3(x, foundationHeight / 2, z), new THREE.Quaternion(), new THREE.Vector3(2.6, foundationHeight, 2.6));
      instancedRefFoundation.current.setMatrixAt(i, m);

      // Frame (steel girders)
      const frameH = height * frameRise;
      m.compose(new THREE.Vector3(x, frameH / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.15, Math.max(0.01, frameH), 0.15));
      instancedRefFrame.current.setMatrixAt(i, m);

      // Skin (finished building)
      const skinH = height * clamp01(skinAppear);
      m.compose(new THREE.Vector3(x, skinH / 2, z), new THREE.Quaternion(), new THREE.Vector3(2.8, Math.max(0.01, skinH), 2.8));
      instancedRefSkin.current.setMatrixAt(i, m);

      i++;
    }

    instancedRefFoundation.current.instanceMatrix.needsUpdate = true;
    instancedRefFrame.current.instanceMatrix.needsUpdate = true;
    instancedRefSkin.current.instanceMatrix.needsUpdate = true;

    const fMat = instancedRefFrame.current.material as THREE.MeshStandardMaterial;
    const sMat = instancedRefSkin.current.material as THREE.MeshStandardMaterial;
    const fdMat = instancedRefFoundation.current.material as THREE.MeshStandardMaterial;

    fMat.color.copy(frameColor);
    sMat.color.copy(skinColor);
    fdMat.color.copy(foundationColor);

    fMat.metalness = 0.6;
    fMat.roughness = 0.5;
    sMat.metalness = 0.2;
    sMat.roughness = 0.65;
    fdMat.metalness = 0.0;
    fdMat.roughness = 0.95;

    // Opacity per phase
    (fMat as any).transparent = true;
    (sMat as any).transparent = true;
    (fdMat as any).transparent = true;

    fdMat.opacity = 0.9 * foundationRise * (1.0 - 0.2 * skinAppear);
    fMat.opacity = clamp01(frameRise * (1.0 - 0.6 * skinAppear));
    sMat.opacity = clamp01(0.15 + 0.85 * skinAppear);
  });

  return (
    <group position={[0, 0, 0]}>
      <instancedMesh ref={instancedRefFoundation} args={[undefined as any, undefined as any, footprints.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* steel frames as thin columns (we use box as proxy columns) */}
      <instancedMesh ref={instancedRefFrame} args={[undefined as any, undefined as any, footprints.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* skins */}
      <instancedMesh ref={instancedRefSkin} args={[undefined as any, undefined as any, footprints.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  );
}

function RoadsAndParks() {
  const matRoad = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1b1d22) }), []);
  const matSidewalk = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2d33) }), []);
  const matTreeTrunk = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5a3d24) }), []);
  const matTreeLeaf = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2f6b35), emissive: new THREE.Color(0x0), roughness: 0.8 }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const phase = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
    const appear = easeInOut(remap(phase, 0.7, 1.0));
    matRoad.opacity = 0.9 * appear;
    matSidewalk.opacity = 0.8 * appear;
    matTreeTrunk.opacity = appear;
    matTreeLeaf.opacity = appear;
    ;[matRoad, matSidewalk, matTreeTrunk, matTreeLeaf].forEach((m) => ((m as any).transparent = true));
  });

  const roads: JSX.Element[] = [];
  for (let i = -48; i <= 48; i += 16) {
    // X roads
    roads.push(
      <mesh key={`rx-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, i]} receiveShadow>
        <planeGeometry args={[200, 3.2]} />
        <primitive object={matRoad} attach="material" />
      </mesh>
    );
    // Z roads
    roads.push(
      <mesh key={`rz-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i, 0.02, 0]} receiveShadow>
        <planeGeometry args={[3.2, 200]} />
        <primitive object={matRoad} attach="material" />
      </mesh>
    );
  }

  const sidewalks: JSX.Element[] = [];
  for (let i = -48; i <= 48; i += 16) {
    sidewalks.push(
      <mesh key={`sx-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, i]} receiveShadow>
        <planeGeometry args={[200, 1.2]} />
        <primitive object={matSidewalk} attach="material" />
      </mesh>
    );
    sidewalks.push(
      <mesh key={`sz-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i, 0.025, 0]} receiveShadow>
        <planeGeometry args={[1.2, 200]} />
        <primitive object={matSidewalk} attach="material" />
      </mesh>
    );
  }

  const trees: JSX.Element[] = [];
  for (let x = -40; x <= 40; x += 16) {
    for (let z = -40; z <= 40; z += 16) {
      const baseX = x + 5;
      const baseZ = z + 5;
      for (let k = 0; k < 5; k++) {
        const ox = (Math.random() - 0.5) * 5;
        const oz = (Math.random() - 0.5) * 5;
        trees.push(
          <group key={`t-${x}-${z}-${k}`} position={[baseX + ox, 0.0, baseZ + oz]}>
            <mesh position={[0, 0.6, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.1, 1.2, 6]} />
              <primitive object={matTreeTrunk} attach="material" />
            </mesh>
            <mesh position={[0, 1.6, 0]} castShadow>
              <coneGeometry args={[0.6, 1.2, 8]} />
              <primitive object={matTreeLeaf} attach="material" />
            </mesh>
          </group>
        );
      }
    }
  }

  return (
    <group>
      <group renderOrder={1}>{roads}</group>
      <group renderOrder={2}>{sidewalks}</group>
      <group renderOrder={3}>{trees}</group>
    </group>
  );
}

function SimpleCranes() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf2c75b), metalness: 0.5, roughness: 0.4 }), []);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    const phase = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
    group.current.children.forEach((child, i) => {
      child.rotation.y = Math.sin(t * 0.3 + i) * 0.2;
    });
    (mat as any).transparent = true;
    const appear = remap(phase, 0.4, 0.7);
    mat.opacity = appear * 0.8 * (1.0 - remap(phase, 0.7, 1.0));
  });

  const cranes: JSX.Element[] = [];
  const positions = [
    [-30, -30],
    [32, -20],
    [-10, 26],
  ];
  positions.forEach(([x, z], idx) => {
    cranes.push(
      <group key={idx} position={[x, 0, z]}>
        <mesh position={[0, 3, 0]} castShadow>
          <boxGeometry args={[0.2, 6, 0.2]} />
          <primitive object={mat} attach="material" />
        </mesh>
        <mesh position={[0.8, 6.2, 0]} castShadow>
          <boxGeometry args={[2.4, 0.2, 0.2]} />
          <primitive object={mat} attach="material" />
        </mesh>
        <mesh position={[1.9, 5.4, 0]} castShadow>
          <boxGeometry args={[0.1, 1.6, 0.1]} />
          <primitive object={mat} attach="material" />
        </mesh>
      </group>
    );
  });
  return <group ref={group}>{cranes}</group>;
}

function Lighting() {
  return (
    <>
      <hemisphereLight intensity={0.6} groundColor={0x171a20} color={0xdfe7ff} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.2} />
    </>
  );
}

function CameraRig() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera, clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    const phase = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
    const orbit = 0.2 + 0.8 * easeInOut(remap(phase, 0.0, 1.0));
    const radius = 90;
    const angle = t * 0.12 + orbit * Math.PI * 1.5;
    const y = 25 + Math.sin(t * 0.25) * 6;
    camera.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    camera.lookAt(0, 6, 0);
  });
  return <group ref={group} />;
}

export function CityCanvas() {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 50, near: 0.1, far: 500 }}>
      <color attach="background" args={[0x05070a]} />

      <Lighting />

      {/* Ground */}
      <Ground />

      {/* Blueprint overlay */}
      <BlueprintOverlay />

      {/* Construction and city */}
      <Buildings />
      <RoadsAndParks />
      <SimpleCranes />

      <Environment preset="sunset" />
      {/* <OrbitControls makeDefault enablePan={false} enableZoom={false} /> */}
      <CameraRig />
    </Canvas>
  );
}
