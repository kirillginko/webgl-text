"use client";

import { useRef, useState, useCallback, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
          <ambientLight intensity={0.4} />
          <spotLight
            position={[0, 15, 0]}
            angle={0.4}
            penumbra={1}
            castShadow
            intensity={2.5}
            shadow-mapSize={[2048, 2048]}
            color="#ffe0c0"
          />
          <pointLight position={[-5, 5, -5]} intensity={0.6} color="#ffd4a8" />
          <pointLight position={[5, 3, 5]} intensity={0.3} color="#ffccaa" />

          <Suspense fallback={null}>
            {playing &&
              sourcesRef.current.map((source, i) => (
                <Track
                  key={i}
                  audioSource={source}
                  label={TRACKS[i].label}
                  muted={muted[i]}
                  baseHue={TRACKS[i].hue}
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
            <shadowMaterial transparent opacity={0.2} />
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
