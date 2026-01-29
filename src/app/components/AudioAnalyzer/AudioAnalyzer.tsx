"use client";

import { useRef, useState, useCallback, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { createAudio, AudioSource } from "./createAudio";
import Track from "./Track";
import Zoom from "./Zoom";

const TRACKS = [
  { url: "/sounds/(Synth).wav", z: -0.25, label: "Synth" },
  { url: "/sounds/(Bass).wav", z: 0, label: "Bass" },
  { url: "/sounds/(Drums).wav", z: 0.25, label: "Drums" },
];

export default function AudioAnalyzer() {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState<boolean[]>([false, false, false]);
  const sourcesRef = useRef<AudioSource[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const startingRef = useRef(false);

  const startAudio = useCallback(async () => {
    if (contextRef.current || startingRef.current) return;
    startingRef.current = true;

    try {
      const ctx = new AudioContext();
      contextRef.current = ctx;
      await ctx.resume();

      const loaded = await Promise.all(
        TRACKS.map((t) => createAudio(t.url, ctx))
      );

      loaded.forEach((s) => s.source.start(0));
      sourcesRef.current = loaded;
      setPlaying(true);
    } catch (e) {
      console.error("Audio failed:", e);
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
          Click anywhere to start
        </div>
      )}

      <div
        onClick={!playing ? startAudio : undefined}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          background:
            "linear-gradient(15deg, rgb(82, 81, 88) 0%, rgb(255, 247, 248) 100%)",
          cursor: !playing ? "pointer" : "default",
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [-1, 1.5, 2], fov: 25 }}
          gl={{ alpha: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.5} />
          <spotLight
            position={[-4, 4, -4]}
            angle={0.06}
            penumbra={1}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />

          <Suspense fallback={null}>
            {playing &&
              sourcesRef.current.map((source, i) => (
                <Track
                  key={i}
                  audioSource={source}
                  label={TRACKS[i].label}
                  muted={muted[i]}
                  onToggleMute={() => toggleMute(i)}
                  position-z={TRACKS[i].z}
                />
              ))}

            {playing && sourcesRef.current.length > 0 && (
              <Zoom audioSource={sourcesRef.current[2]} />
            )}
          </Suspense>

          <mesh
            receiveShadow
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.025, 0]}
          >
            <planeGeometry args={[10, 10]} />
            <shadowMaterial transparent opacity={0.15} />
          </mesh>
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
