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
const ROWS = 10;
const DOT_SIZE = 0.006;
const GAP_X = 0.009;
const GAP_Y = 0.008;
const BORDER = 0.15; // border thickness as fraction of dot

const tempMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3();
const tempColor = new THREE.Color();

// Hollow square outline geometry (square with a square hole)
function createOutlineGeometry() {
  const s = 0.5;
  const t = s - BORDER;
  const shape = new THREE.Shape();
  shape.moveTo(-s, -s);
  shape.lineTo(s, -s);
  shape.lineTo(s, s);
  shape.lineTo(-s, s);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-t, -t);
  hole.lineTo(t, -t);
  hole.lineTo(t, t);
  hole.lineTo(-t, t);
  hole.closePath();
  shape.holes.push(hole);

  return new THREE.ShapeGeometry(shape);
}

export default function Track({
  audioSource,
  label,
  muted,
  onToggleMute,
  ...props
}: TrackProps) {
  const litRef = useRef<THREE.InstancedMesh>(null);
  const outlineRef = useRef<THREE.InstancedMesh>(null);
  const { update, data } = audioSource;
  const count = COLS * ROWS;

  const totalWidth = COLS * GAP_X;
  const leftEdge = -totalWidth / 2;
  const totalHeight = ROWS * GAP_Y;

  const outlineGeo = useMemo(() => createOutlineGeometry(), []);

  const positions = useMemo(() => {
    const pos: [number, number][] = [];
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        pos.push([col * GAP_X + leftEdge, row * GAP_Y]);
      }
    }
    return pos;
  }, [leftEdge]);

  // Set outline grid positions once
  const outlineReady = useRef(false);
  useFrame(() => {
    if (!litRef.current || !outlineRef.current) return;

    // Initialize outline positions on first frame
    if (!outlineReady.current) {
      for (let i = 0; i < count; i++) {
        const [x, y] = positions[i];
        tempMatrix.identity();
        tempMatrix.makeTranslation(x, y, 0);
        tempMatrix.scale(new THREE.Vector3(DOT_SIZE, DOT_SIZE, 1));
        outlineRef.current.setMatrixAt(i, tempMatrix);
      }
      outlineRef.current.instanceMatrix.needsUpdate = true;
      outlineReady.current = true;
    }

    const avg = update();

    for (let col = 0; col < COLS; col++) {
      const magnitude = data[col] / 255;
      const litRows = Math.floor(magnitude * ROWS);

      for (let row = 0; row < ROWS; row++) {
        const idx = col * ROWS + row;
        const [x, y] = positions[idx];
        const lit = row < litRows;

        tempMatrix.identity();
        tempMatrix.makeTranslation(x, y, 0);
        tempScale.setScalar(lit ? 1 : 0);
        tempMatrix.scale(tempScale);
        litRef.current.setMatrixAt(idx, tempMatrix);

        if (lit) {
          tempColor.setHSL(avg / 500, 0.75, muted ? 0.25 : 0.7);
          litRef.current.setColorAt(idx, tempColor);
        }
      }
    }

    litRef.current.instanceMatrix.needsUpdate = true;
    if (litRef.current.instanceColor) {
      litRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group {...props}>
      {/* Invisible hit area */}
      <mesh
        position={[0, totalHeight / 2, 0]}
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
        <planeGeometry args={[totalWidth + 0.04, totalHeight + 0.02]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <Html
        position={[leftEdge - 0.02, totalHeight / 2, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "10px",
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

      {/* Outline grid - always visible */}
      <instancedMesh
        ref={outlineRef}
        args={[outlineGeo, undefined, count]}
      >
        <meshBasicMaterial color="#444" toneMapped={false} />
      </instancedMesh>

      {/* Lit squares - on top */}
      <instancedMesh
        castShadow
        ref={litRef}
        args={[undefined, undefined, count]}
      >
        <planeGeometry args={[DOT_SIZE, DOT_SIZE]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
