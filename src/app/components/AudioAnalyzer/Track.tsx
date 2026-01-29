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
const STACK = 20;
const DEPTH = 6;
const BOX_SIZE = 0.08;
const GUTTER = 0.05;
const STEP = BOX_SIZE + GUTTER;
const COUNT = COLS * STACK * DEPTH;
const ATTACK = 0.35;
const DECAY = 0.06;
const GRAVITY = 0.002;
const BOUNCE = 0.6;
const CELLS = COLS * DEPTH;

const GRID_HEIGHT = 0.012;

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

function buildBinMap(rawCount: number): Uint16Array {
  const usable = Math.floor(rawCount * 0.5);
  const map = new Uint16Array(CELLS);

  for (let row = 0; row < DEPTH; row++) {
    const rowFrac = (row - (DEPTH - 1) / 2) / DEPTH;
    for (let col = 0; col < COLS; col++) {
      const t = (col + 0.5) / COLS;
      const baseBin = t * t * usable;
      const spread = Math.max(2, baseBin * 0.08);
      const bin = Math.round(baseBin + rowFrac * spread);
      map[row * COLS + col] = Math.max(0, Math.min(usable - 1, bin));
    }
  }
  return map;
}

export default function Track({
  audioSource,
  label,
  muted,
  baseHue,
  onToggleMute,
  ...props
}: TrackProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const gridRef = useRef<THREE.InstancedMesh>(null);
  const gridInited = useRef(false);
  const smoothed = useRef<Float32Array | null>(null);
  const cubeY = useRef<Float32Array | null>(null);
  const cubeVel = useRef<Float32Array | null>(null);
  const { update, raw } = audioSource;

  const gridWidth = COLS * STEP;
  const gridDepth = DEPTH * STEP;

  const binMap = useMemo(() => buildBinMap(raw.length), [raw.length]);

  const jitter = useMemo(() => {
    const j = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      j[i] = Math.random() * 0.003;
    }
    return j;
  }, []);

  // Persistent typed arrays for custom instance attributes
  const emissiveArray = useMemo(() => new Float32Array(COUNT * 3), []);
  const roughnessArray = useMemo(() => {
    const a = new Float32Array(COUNT);
    a.fill(0.5);
    return a;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    // Attach per-instance attributes up front so the shader compiler sees them
    geo.setAttribute(
      "aEmissive",
      new THREE.InstancedBufferAttribute(emissiveArray, 3)
    );
    geo.setAttribute(
      "aRoughness",
      new THREE.InstancedBufferAttribute(roughnessArray, 1)
    );
    return geo;
  }, [emissiveArray, roughnessArray]);

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      roughness: 0.35,
      metalness: 0.15,
      toneMapped: false,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
    });

    mat.onBeforeCompile = (shader) => {
      // ── Vertex: declare custom attributes + pass to fragment ──
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        attribute vec3 aEmissive;
        attribute float aRoughness;
        varying vec3 vEmissive;
        varying float vInstanceRoughness;
        varying vec3 vWorldPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vEmissive = aEmissive;
        vInstanceRoughness = aRoughness;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `vec4 _wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        _wp = modelMatrix * _wp;
        vWorldPos = _wp.xyz;
        #include <project_vertex>`
      );

      // ── Fragment: declare varyings ──
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vEmissive;
        varying float vInstanceRoughness;
        varying vec3 vWorldPos;`
      );

      // ── Override roughness with per-instance value ──
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = vInstanceRoughness;`
      );

      // ── Add per-instance emissive ──
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vEmissive;`
      );

      // ── Fresnel rim glow ──
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <output_fragment>",
        `vec3 _vd = normalize(cameraPosition - vWorldPos);
        vec3 _wn = normalize(inverseTransformDirection(geometry.normal, viewMatrix));
        float _fres = pow(1.0 - max(dot(_wn, _vd), 0.0), 3.0);
        outgoingLight += vEmissive * _fres * 0.6;
        #include <output_fragment>`
      );
    };

    mat.customProgramCacheKey = () => "track-cube-v2";
    return mat;
  }, []);

  const gridGeometry = useMemo(() => {
    return new THREE.BoxGeometry(BOX_SIZE, GRID_HEIGHT, BOX_SIZE);
  }, []);

  const gridMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.6,
        metalness: 0.0,
        toneMapped: false,
        transparent: true,
        opacity: 0.35,
      }),
    []
  );

  const colPositions = useMemo(() => {
    const centerX = gridWidth / 2;
    const xs: number[] = [];
    for (let col = 0; col < COLS; col++) {
      xs.push(col * STEP - centerX);
    }
    return xs;
  }, [gridWidth]);

  const rowPositions = useMemo(() => {
    const centerZ = gridDepth / 2;
    const zs: number[] = [];
    for (let row = 0; row < DEPTH; row++) {
      zs.push(row * STEP - centerZ);
    }
    return zs;
  }, [gridDepth]);

  useFrame(() => {
    if (!ref.current) return;
    update();

    // Lazy-init buffers
    if (!smoothed.current) smoothed.current = new Float32Array(CELLS);
    if (!cubeY.current) cubeY.current = new Float32Array(COUNT);
    if (!cubeVel.current) cubeVel.current = new Float32Array(COUNT);

    const sm = smoothed.current;
    const cy = cubeY.current;
    const cv = cubeVel.current;

    // One-time grid base setup
    if (!gridInited.current && gridRef.current) {
      gridInited.current = true;
      for (let row = 0; row < DEPTH; row++) {
        const z = rowPositions[row];
        for (let col = 0; col < COLS; col++) {
          const i = row * COLS + col;
          const x = colPositions[col];
          tempObj.position.set(x, -GRID_HEIGHT / 2, z);
          tempObj.scale.set(1, 1, 1);
          tempObj.updateMatrix();
          gridRef.current.setMatrixAt(i, tempObj.matrix);

          if (muted) {
            tempColor.setHSL(0, 0, 0.04);
          } else {
            tempColor.setHSL(baseHue, 0.3, 0.04);
          }
          gridRef.current.setColorAt(i, tempColor);
        }
      }
      gridRef.current.instanceMatrix.needsUpdate = true;
      if (gridRef.current.instanceColor) {
        gridRef.current.instanceColor.needsUpdate = true;
      }
    }

    // Update grid colors when mute state changes
    if (gridRef.current) {
      for (let i = 0; i < CELLS; i++) {
        if (muted) {
          tempColor.setHSL(0, 0, 0.04);
        } else {
          tempColor.setHSL(baseHue, 0.3, 0.04);
        }
        gridRef.current.setColorAt(i, tempColor);
      }
      if (gridRef.current.instanceColor) {
        gridRef.current.instanceColor.needsUpdate = true;
      }
    }

    // Smooth each (col, row) cell independently
    for (let i = 0; i < CELLS; i++) {
      const target = raw[binMap[i]] / 255;
      const lerp = target > sm[i] ? ATTACK : DECAY;
      sm[i] += (target - sm[i]) * lerp;
    }

    // Per-instance physics + rendering + attribute updates
    for (let row = 0; row < DEPTH; row++) {
      const z = rowPositions[row];
      for (let level = 0; level < STACK; level++) {
        for (let col = 0; col < COLS; col++) {
          const idx = row * COLS * STACK + level * COLS + col;
          const cellIdx = row * COLS + col;
          const x = colPositions[col];
          const homeY = level * STEP;
          const activeLevel = Math.floor(sm[cellIdx] * STACK);
          const t = level / STACK;

          if (level < activeLevel) {
            // Audio is holding this cube
            cy[idx] = homeY;
            cv[idx] = 0;

            tempObj.position.set(x, homeY, z);
            tempObj.scale.set(1, 1, 1);

            if (muted) {
              const lit = 0.03 + t * 0.12;
              tempColor.setHSL(0, 0, lit);
              // Dim emissive for muted
              emissiveArray[idx * 3] = 0;
              emissiveArray[idx * 3 + 1] = 0;
              emissiveArray[idx * 3 + 2] = 0;
              roughnessArray[idx] = 0.5;
            } else {
              const hue = baseHue + t * 0.1;
              const sat = 0.6 + t * 0.3;
              const lit = 0.08 + t * 0.5;
              tempColor.setHSL(hue, sat, lit);
              const boost = 1 + t * t * 8;
              tempColor.multiplyScalar(boost);

              // Per-instance emissive: ramps with height
              const emStr = t * t * 2.5;
              emissiveArray[idx * 3] = tempColor.r * emStr;
              emissiveArray[idx * 3 + 1] = tempColor.g * emStr;
              emissiveArray[idx * 3 + 2] = tempColor.b * emStr;

              // Per-instance roughness: top = glossy, bottom = matte
              roughnessArray[idx] = 0.55 - t * 0.5;
            }
          } else {
            // Cube is free — individual physics
            if (cy[idx] > 0 || cv[idx] !== 0) {
              cv[idx] -= GRAVITY + jitter[idx];
              cy[idx] += cv[idx];

              if (cy[idx] <= 0) {
                cy[idx] = 0;
                if (cv[idx] < -0.004) {
                  cv[idx] = -cv[idx] * BOUNCE;
                } else {
                  cv[idx] = 0;
                }
              }
            }

            if (cy[idx] <= 0 && cv[idx] === 0) {
              // Settled — hide
              tempObj.position.set(x, 0, z);
              tempObj.scale.set(0, 0, 0);
              tempColor.setRGB(0, 0, 0);
              emissiveArray[idx * 3] = 0;
              emissiveArray[idx * 3 + 1] = 0;
              emissiveArray[idx * 3 + 2] = 0;
              roughnessArray[idx] = 0.5;
            } else {
              // Falling / bouncing
              tempObj.position.set(x, cy[idx], z);
              tempObj.scale.set(1, 1, 1);

              if (muted) {
                tempColor.setHSL(0, 0, 0.08);
                emissiveArray[idx * 3] = 0;
                emissiveArray[idx * 3 + 1] = 0;
                emissiveArray[idx * 3 + 2] = 0;
              } else {
                const hue = baseHue + t * 0.1;
                const sat = 0.5 + t * 0.2;
                const lit = 0.06 + t * 0.4;
                tempColor.setHSL(hue, sat, lit);
                const boost = 1 + t * t * 6;
                tempColor.multiplyScalar(boost);

                // Dimmer emissive while falling
                const emStr = t * t * 1.2;
                emissiveArray[idx * 3] = tempColor.r * emStr;
                emissiveArray[idx * 3 + 1] = tempColor.g * emStr;
                emissiveArray[idx * 3 + 2] = tempColor.b * emStr;
              }
              roughnessArray[idx] = 0.55 - t * 0.5;
            }
          }

          tempObj.updateMatrix();
          ref.current!.setMatrixAt(idx, tempObj.matrix);
          ref.current!.setColorAt(idx, tempColor);
        }
      }
    }

    // Flag all buffers for GPU upload
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) {
      ref.current.instanceColor.needsUpdate = true;
    }
    const emAttr = ref.current.geometry.getAttribute(
      "aEmissive"
    ) as THREE.InstancedBufferAttribute;
    const roughAttr = ref.current.geometry.getAttribute(
      "aRoughness"
    ) as THREE.InstancedBufferAttribute;
    if (emAttr) emAttr.needsUpdate = true;
    if (roughAttr) roughAttr.needsUpdate = true;
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
        ref={gridRef}
        args={[gridGeometry, gridMaterial, CELLS]}
      />

      <instancedMesh
        ref={ref}
        args={[geometry, material, COUNT]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
