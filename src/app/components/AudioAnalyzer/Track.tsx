"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AudioSource } from "./createAudio";

interface TrackProps {
  audioSource: AudioSource;
  label: string;
  muted: boolean;
  onToggleMute: () => void;
  [key: string]: unknown;
}

const COLS = 32;
const ROWS = 12;
const BOX_SIZE = 0.1;
const GUTTER = 0.02;
const MAX_HEIGHT = 8;
const COUNT = COLS * ROWS;

const tempObj = new THREE.Object3D();

export default function Track({
  audioSource,
  label,
  muted,
  onToggleMute,
  ...props
}: TrackProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { update, data } = audioSource;

  const gridWidth = COLS * (BOX_SIZE + GUTTER);
  const gridDepth = ROWS * (BOX_SIZE + GUTTER);

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    geo.translate(0, BOX_SIZE / 2, 0);
    return geo;
  }, []);

  const materials = useMemo(() => {
    const topMat = new THREE.MeshPhysicalMaterial({
      color: "#b7a500",
      roughness: 0.4,
    });
    const sideMat = new THREE.MeshPhysicalMaterial({
      color: "#380007",
      roughness: 0.6,
    });
    const bottomMat = new THREE.MeshPhysicalMaterial({
      color: "#03020a",
      roughness: 0.8,
    });
    return [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
  }, []);

  // Pre-compute XZ positions
  const positions = useMemo(() => {
    const pos: [number, number][] = [];
    const centerX = gridWidth / 2;
    const centerZ = gridDepth / 2;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        pos.push([
          col * (BOX_SIZE + GUTTER) - centerX,
          row * (BOX_SIZE + GUTTER) - centerZ,
        ]);
      }
    }
    return pos;
  }, [gridWidth, gridDepth]);

  useFrame(() => {
    if (!ref.current) return;
    const avg = update();

    // Update top material color based on avg frequency
    const topMat = materials[2] as THREE.MeshPhysicalMaterial;
    topMat.color.setHSL(avg / 500, 0.85, muted ? 0.2 : 0.55);

    const sideMat = materials[0] as THREE.MeshPhysicalMaterial;
    sideMat.color.setHSL(avg / 500 + 0.05, 0.6, muted ? 0.1 : 0.25);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const [x, z] = positions[idx];
        const magnitude = data[col] / 255;
        const yScale = Math.max(0.001, magnitude * MAX_HEIGHT);

        tempObj.position.set(x, 0, z);
        tempObj.scale.set(1, muted ? 0.001 : yScale, 1);
        tempObj.updateMatrix();

        ref.current.setMatrixAt(idx, tempObj.matrix);
      }
    }

    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group {...props}>
      {/* Invisible hit area */}
      <mesh
        position={[0, 0.5, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[gridWidth + 0.2, 2, gridDepth + 0.2]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <Html
        position={[-gridWidth / 2 - 0.15, 0, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "11px",
            color: muted ? "#666" : "#ccc",
            whiteSpace: "nowrap",
            userSelect: "none",
            textDecoration: muted ? "line-through" : "none",
            opacity: muted ? 0.5 : 1,
          }}
        >
          {label}
        </span>
      </Html>

      <instancedMesh
        ref={ref}
        args={[geometry, materials, COUNT]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
