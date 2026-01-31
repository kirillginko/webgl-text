"use client";

import { useRef, useState, useCallback, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, SoftShadows } from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { createAudio, AudioSource } from "./createAudio";
import Track from "./Track";
import Zoom from "./Zoom";

const TRACKS = [
  {
    url: "/sounds/Meiso Ongaku 1 (Bass).m4a",
    z: -3.75,
    label: "Bass",
    hue: 0.0,
  },
  {
    url: "/sounds/Meiso Ongaku 1 (Drums).m4a",
    z: -1.25,
    label: "Drums",
    hue: 0.28,
  },
  {
    url: "/sounds/Meiso Ongaku 1 (Guitar).m4a",
    z: 1.25,
    label: "Guitar",
    hue: 0.55,
  },
  {
    url: "/sounds/Meiso Ongaku 1 (Woodwind).m4a",
    z: 3.75,
    label: "Woodwind",
    hue: 0.78,
  },
];

// Rim lights pulse on alternating eighth notes
const BPM = 99;
const EIGHTH = (60 / BPM) / 2;
const RIM_DIM = 1.2;
const RIM_FLASH = 10.0;
const FLASH_SHARPNESS = 10;

function PulseRimLights({ source }: { source: AudioSource }) {
  const blueRef = useRef<THREE.PointLight>(null);
  const warmRef = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const t = source.context.currentTime;
    const eighthFrac = (t / EIGHTH) % 2; // 0→2 over two eighths
    const idx = Math.floor(eighthFrac); // 0 or 1
    const phase = eighthFrac - idx; // 0→1 within the eighth
    const envelope = Math.exp(-phase * FLASH_SHARPNESS);

    // Alternate: blue on even eighths, warm on odd eighths
    if (blueRef.current) {
      blueRef.current.intensity = RIM_DIM + envelope * RIM_FLASH * (idx === 0 ? 1 : 0);
    }
    if (warmRef.current) {
      warmRef.current.intensity = RIM_DIM + envelope * RIM_FLASH * (idx === 1 ? 1 : 0);
    }
  });

  return (
    <>
      <pointLight
        ref={blueRef}
        position={[-8, 6, -10]}
        color="#4488ff"
        intensity={RIM_DIM}
        distance={40}
        decay={1.8}
      />
      <pointLight
        ref={warmRef}
        position={[8, 4, -8]}
        color="#ff8844"
        intensity={RIM_DIM}
        distance={35}
        decay={1.8}
      />
    </>
  );
}

export default function AudioAnalyzer() {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState<boolean[]>([false, false, false, false]);
  const sourcesRef = useRef<AudioSource[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const startingRef = useRef(false);

  const startAudio = useCallback(async () => {
    if (contextRef.current || startingRef.current) return;
    startingRef.current = true;
    setLoading(true);

    try {
      const ctx = new AudioContext();
      contextRef.current = ctx;
      await ctx.resume();

      const loaded = await Promise.all(
        TRACKS.map((t) => createAudio(t.url, ctx)),
      );

      loaded.forEach((s) => s.source.start(0));
      sourcesRef.current = loaded;
      setLoading(false);
      setPlaying(true);
    } catch (e) {
      console.error("Audio failed:", e);
      setLoading(false);
      startingRef.current = false;
      contextRef.current = null;
    }
  }, []);

  const togglePause = useCallback(async () => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (ctx.state === "running") {
      await ctx.suspend();
      setPaused(true);
    } else {
      await ctx.resume();
      setPaused(false);
    }
  }, []);

  const toggleMute = useCallback((index: number) => {
    const source = sourcesRef.current[index];
    if (!source) return;

    setMuted((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      source.gain.gain.value = next[index] ? 0 : 1;
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      sourcesRef.current.forEach((s) => {
        try {
          s.source.stop();
        } catch {
          /* already stopped */
        }
        s.gain.disconnect();
      });
      contextRef.current?.close();
    };
  }, []);

  return (
    <>
      {playing && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            letterSpacing: "0.05em",
          }}
        >
          <button onClick={togglePause} style={btnStyle}>
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      )}

      {!playing && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            color: "#666",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {loading ? "Loading audio..." : "Click anywhere to start"}
        </div>
      )}

      <div
        onClick={!playing ? startAudio : undefined}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          background: "#0a0a0a",
          cursor: !playing ? "pointer" : "default",
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [10, 10, 10], fov: 20 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <SoftShadows size={25} samples={16} focus={0.5} />

          {/* Fill: hemisphere + ambient */}
          <hemisphereLight args={["#b1c5ff", "#2a1a0a", 0.3]} />
          <ambientLight intensity={0.15} />

          {/* Key: soft directional from above-front */}
          <directionalLight
            position={[5, 12, 8]}
            intensity={2.0}
            color="#ffe4cc"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
            shadow-camera-near={1}
            shadow-camera-far={30}
            shadow-radius={4}
          />

          {/* Rhythmic rim lights — alternate on quarter notes */}
          {playing && sourcesRef.current.length > 1 ? (
            <PulseRimLights source={sourcesRef.current[1]} />
          ) : (
            <>
              <pointLight
                position={[-8, 6, -10]}
                color="#4488ff"
                intensity={RIM_DIM}
                distance={40}
                decay={1.8}
              />
              <pointLight
                position={[8, 4, -8]}
                color="#ff8844"
                intensity={RIM_DIM}
                distance={35}
                decay={1.8}
              />
            </>
          )}

          <Suspense fallback={null}>
            {playing &&
              sourcesRef.current.map((source, i) => (
                <Track
                  key={i}
                  audioSource={source}
                  label={TRACKS[i].label}
                  muted={muted[i]}
                  baseHue={TRACKS[i].hue}
                  trackIndex={i}
                  onToggleMute={() => toggleMute(i)}
                  position={[0, 0, TRACKS[i].z]}
                />
              ))}

            {playing && sourcesRef.current.length > 0 && (
              <Zoom audioSource={sourcesRef.current[3]} />
            )}
          </Suspense>

          <mesh
            receiveShadow
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.01, 0]}
          >
            <planeGeometry args={[50, 50]} />
            <shadowMaterial transparent opacity={0.35} />
          </mesh>

          <OrbitControls
            autoRotate
            autoRotateSpeed={2}
            maxPolarAngle={Math.PI / 2.5}
            enableDamping
            dampingFactor={0.04}
          />

          <EffectComposer>
            <Bloom
              intensity={2.5}
              luminanceThreshold={0.1}
              luminanceSmoothing={0.7}
              mipmapBlur
              radius={0.85}
            />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}

const btnStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.12)",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: 4,
  color: "#fff",
  padding: "6px 16px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
  letterSpacing: "inherit",
  backdropFilter: "blur(8px)",
  transition: "opacity 0.2s",
};
