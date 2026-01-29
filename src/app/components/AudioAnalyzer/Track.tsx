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
  baseHue: number;
  onToggleMute: () => void;
  [key: string]: unknown;
}

const COLS = 32;
const ROWS = 12;
const BOX_SIZE = 0.1;
const GUTTER = 0.02;
const MAX_HEIGHT = 8;
const COUNT = COLS * ROWS;
const ATTACK = 0.35;
const DECAY = 0.06;

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

export default function Track({
  audioSource,
  label,
  muted,
  baseHue,
  onToggleMute,
  ...props
}: TrackProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const smoothed = useRef<Float32Array | null>(null);
  const { update, data } = audioSource;

  const gridWidth = COLS * (BOX_SIZE + GUTTER);
  const gridDepth = ROWS * (BOX_SIZE + GUTTER);

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    geo.translate(0, BOX_SIZE / 2, 0);
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.4,
        metalness: 0.1,
        toneMapped: false,
      }),
    []
  );

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
    update();

    // Lazy-init smoothed buffer
    if (!smoothed.current) {
      smoothed.current = new Float32Array(COLS);
    }
    const sm = smoothed.current;

    // Smooth each column: fast attack, slow decay
    for (let col = 0; col < COLS; col++) {
      const target = data[col] / 255;
      const lerp = target > sm[col] ? ATTACK : DECAY;
      sm[col] += (target - sm[col]) * lerp;
    }

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const [x, z] = positions[idx];
        const mag = sm[col];
        const yScale = Math.max(0.001, mag * MAX_HEIGHT);

        tempObj.position.set(x, 0, z);
        tempObj.scale.set(1, yScale, 1);
        tempObj.updateMatrix();
        ref.current.setMatrixAt(idx, tempObj.matrix);

        // Per-instance color: height drives hue shift + HDR brightness for bloom
        if (muted) {
          const lit = 0.03 + mag * 0.12;
          tempColor.setHSL(0, 0, lit);
        } else {
          const hue = baseHue + mag * 0.12;
          const sat = 0.6 + mag * 0.3;
          const lit = 0.05 + mag * 0.55;
          tempColor.setHSL(hue, sat, lit);
          // Aggressively push into HDR for strong bloom glow
          const boost = 1 + mag * mag * 8;
          tempColor.multiplyScalar(boost);
        }
        ref.current.setColorAt(idx, tempColor);
      }
    }

    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) {
      ref.current.instanceColor.needsUpdate = true;
    }
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
        args={[geometry, material, COUNT]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
