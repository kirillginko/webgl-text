"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, Fisheye, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

function Model() {
  const { scene } = useGLTF("/models/asicscompressed.glb");
  const ref = useRef();
  const materialsApplied = useRef(false);

  if (!materialsApplied.current) {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshPhysicalMaterial({
          color: 0xff6666,
          metalness: 1.0,
          roughness: 0.1,
          envMapIntensity: 4.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          iridescence: 0.8,
          iridescenceIOR: 2.2,
          sheen: 1.0,
          sheenRoughness: 0.3,
          sheenColor: new THREE.Color(0xffcccc),
        });
      }
    });
    materialsApplied.current = true;
  }

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.005;

      const time = state.clock.elapsedTime;
      ref.current.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.iridescenceIOR = 1.8 + Math.sin(time * 0.5) * 0.4;
          child.material.sheen = 0.8 + Math.sin(time * 0.3) * 0.2;
          const hue = Math.sin(time * 0.2) * 0.05 + 0.0;
          const saturation = 0.6 + Math.sin(time * 0.3) * 0.2;
          const lightness = 0.7 + Math.sin(time * 0.25) * 0.1;
          child.material.color.setHSL(hue, saturation, lightness);
        }
      });
    }
  });

  return <primitive ref={ref} object={scene} scale={0.15} />;
}

export default function AsicsViewer() {
  // Slider controls zoom: 0 = far away, 1 = close up with max distortion
  const [zoomLevel, setZoomLevel] = useState(0);

  // Camera distance: far (15) when zoomLevel=0, close (2.5) when zoomLevel=1
  const cameraZ = 15 - zoomLevel * 12.5;

  // Fisheye zoom - higher values = more distortion (0 to 4)
  const fisheyeZoom = zoomLevel * 4;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1,
        }}
      >
        <Canvas flat>
          <Fisheye zoom={fisheyeZoom}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={2} />
            <pointLight position={[10, 10, 10]} intensity={2.5} color="#ff3333" />
            <pointLight position={[-10, -10, -10]} intensity={2} color="#ff9999" />
            <pointLight position={[0, 10, -10]} intensity={2} color="#ff6666" />

            <Model />
            <Environment preset="studio" />
            <PerspectiveCamera makeDefault position={[0, 0, cameraZ]} />
          </Fisheye>
        </Canvas>
      </div>

      {/* Zoom slider UI */}
      <div
        style={{
          position: "fixed",
          left: 20,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            color: "#fff",
            fontSize: 12,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Zoom
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={zoomLevel * 100}
          onChange={(e) => setZoomLevel(Number(e.target.value) / 100)}
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            height: 150,
            cursor: "pointer",
            accentColor: "#ff6666",
          }}
        />
        <span
          style={{
            color: "#fff",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {Math.round(zoomLevel * 100)}%
        </span>
      </div>
    </>
  );
}

useGLTF.preload("/models/asicscompressed.glb");
