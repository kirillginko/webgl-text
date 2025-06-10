"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import styles from "./PixelizedVideoGrid.module.css";

interface PixelizedVideoGridProps {
  videoSrc: string;
  gridSize?: number;
  pixelIntensity?: number;
  className?: string;
  variant?: "default" | "fullscreen" | "halfHeight" | "fullHeight" | "square";
  ditherIntensity?: number;
  chromaticAberration?: number;
  colorShiftSpeed?: number;
  pixelGap?: number;
  ghostingIntensity?: number;
}

function VideoMaterial({
  videoRef,
  gridSize,
  pixelIntensity,
  ditherIntensity = 0.75,
  chromaticAberration = 0.5,
  colorShiftSpeed = 1.0,
  pixelGap = 0.2,
  ghostingIntensity = 0.3,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  gridSize: number;
  pixelIntensity: number;
  ditherIntensity: number;
  chromaticAberration: number;
  colorShiftSpeed: number;
  pixelGap: number;
  ghostingIntensity: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  const previousFrameRef = useRef<THREE.Texture | null>(null);

  const renderTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(viewport.width, viewport.height);
  }, [viewport.width, viewport.height]);

  const vertexShader = `
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D uTexture;
    uniform sampler2D uPrevFrame;
    uniform float uTime;
    uniform float uGridSize;
    uniform float uPixelIntensity;
    uniform float uDitherIntensity;
    uniform float uChromaticAberration;
    uniform float uColorShiftSpeed;
    uniform float uPixelGap;
    uniform float uGhostingIntensity;
    uniform vec2 uResolution;
    
    varying vec2 vUv;

    float getBayerFromCoord(float x, float y) {
      if(x == 0.0 && y == 0.0) return 0.0;
      if(x == 0.0 && y == 1.0) return 8.0;
      if(x == 0.0 && y == 2.0) return 2.0;
      if(x == 0.0 && y == 3.0) return 10.0;
      if(x == 1.0 && y == 0.0) return 12.0;
      if(x == 1.0 && y == 1.0) return 4.0;
      if(x == 1.0 && y == 2.0) return 14.0;
      if(x == 1.0 && y == 3.0) return 6.0;
      if(x == 2.0 && y == 0.0) return 3.0;
      if(x == 2.0 && y == 1.0) return 11.0;
      if(x == 2.0 && y == 2.0) return 1.0;
      if(x == 2.0 && y == 3.0) return 9.0;
      if(x == 3.0 && y == 0.0) return 15.0;
      if(x == 3.0 && y == 1.0) return 7.0;
      if(x == 3.0 && y == 2.0) return 13.0;
      if(x == 3.0 && y == 3.0) return 5.0;
      return 0.0;
    }

    float getBayerDither(vec2 position) {
      float x = mod(position.x, 4.0);
      float y = mod(position.y, 4.0);
      return getBayerFromCoord(x, y) / 16.0;
    }

    vec4 sampleWithChromaticAberration(vec2 uv, float aberration) {
      vec2 dir = (uv - 0.5) * 2.0;
      float dist = length(dir);
      
      vec2 rUV = uv + dir * aberration * dist * 0.01 * vec2(1.0, 0.5);
      vec2 gUV = uv;
      vec2 bUV = uv - dir * aberration * dist * 0.01 * vec2(1.0, 0.5);
      
      float r = texture2D(uTexture, rUV).r;
      float g = texture2D(uTexture, gUV).g;
      float b = texture2D(uTexture, bUV).b;
      
      return vec4(r, g, b, 1.0);
    }

    vec3 colorShift(vec3 color, float time) {
      // Create a shifting color matrix
      mat3 colorMatrix = mat3(
        sin(time * 0.1) * 0.5 + 0.5, sin(time * 0.2) * 0.3, sin(time * 0.3) * 0.2,
        sin(time * 0.4) * 0.2, sin(time * 0.5) * 0.5 + 0.5, sin(time * 0.6) * 0.3,
        sin(time * 0.7) * 0.3, sin(time * 0.8) * 0.2, sin(time * 0.9) * 0.5 + 0.5
      );
      
      return colorMatrix * color;
    }
    
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    
    vec2 getGhostOffset(float time, vec2 uv) {
      float angle = time * 0.5;
      float xOffset = cos(angle + uv.y * 2.0) * 0.003;
      float yOffset = sin(angle + uv.x * 2.0) * 0.003;
      return vec2(xOffset, yOffset);
    }
    
    void main() {
      vec2 gridSize = vec2(uGridSize);
      vec2 cellSize = 1.0 / gridSize;
      vec2 cell = floor(vUv * gridSize);
      vec2 cellUv = cell / gridSize;
      vec2 cellCenter = cellUv + (cellSize * 0.5);
      
      vec4 videoColor = sampleWithChromaticAberration(cellCenter, uChromaticAberration);
      
      vec2 ghostOffset = getGhostOffset(uTime, vUv);
      vec4 prevFrameColor = texture2D(uPrevFrame, cellCenter + ghostOffset);
      
      vec4 blendedColor = mix(videoColor, prevFrameColor, uGhostingIntensity);
      
      vec2 fromCenter = abs(vUv - cellCenter);
      
      float squareSize = cellSize.x * (1.0 - uPixelGap);
      vec2 squareTest = step(fromCenter, vec2(squareSize * 0.5));
      float isInSquare = squareTest.x * squareTest.y;
      
      float dither = getBayerDither(gl_FragCoord.xy);
      
      vec3 hsv = rgb2hsv(blendedColor.rgb);
      
      float ditherValue = hsv.z + (dither - 0.5) * uDitherIntensity;
      hsv.z = clamp(ditherValue, 0.0, 1.0);
      
      vec3 ditheredColor = hsv2rgb(hsv);
      
      vec3 shiftedColor = colorShift(ditheredColor, uTime * uColorShiftSpeed);
      
      vec3 rainbow = 0.5 + 0.5 * cos(
        uTime * 0.5 + 
        vUv.xyx * 2.0 + 
        vec3(0.0, 2.0, 4.0) + 
        sin(uTime * uColorShiftSpeed) * vec3(1.0, 2.0, 3.0)
      );
      
      vec3 finalColor = mix(
        shiftedColor,
        rainbow,
        hsv.z * 0.3
      );
      
      float scanline = sin(vUv.y * gridSize.y * 2.0 + uTime * 5.0) * 0.05;
      finalColor += scanline;
      
      if (isInSquare > 0.5) {
        gl_FragColor = vec4(finalColor, 1.0);
      } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      }
    }
  `;

  const uniforms = useMemo(
    () => ({
      uTexture: { value: null },
      uPrevFrame: { value: null },
      uTime: { value: 0 },
      uGridSize: { value: gridSize },
      uPixelIntensity: { value: pixelIntensity },
      uDitherIntensity: { value: ditherIntensity },
      uChromaticAberration: { value: chromaticAberration },
      uColorShiftSpeed: { value: colorShiftSpeed },
      uPixelGap: { value: pixelGap },
      uGhostingIntensity: { value: ghostingIntensity },
      uResolution: {
        value: new THREE.Vector2(viewport.width, viewport.height),
      },
    }),
    [
      gridSize,
      pixelIntensity,
      ditherIntensity,
      chromaticAberration,
      colorShiftSpeed,
      pixelGap,
      ghostingIntensity,
      viewport,
    ]
  );

  useFrame((state) => {
    if (!videoRef.current || !materialRef.current) return;

    materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();

    if (!videoRef.current.paused) {
      if (!materialRef.current.uniforms.uTexture.value) {
        materialRef.current.uniforms.uTexture.value = new THREE.VideoTexture(
          videoRef.current
        );
      }

      if (previousFrameRef.current) {
        materialRef.current.uniforms.uPrevFrame.value =
          previousFrameRef.current;
      } else {
        previousFrameRef.current = new THREE.VideoTexture(videoRef.current);
        materialRef.current.uniforms.uPrevFrame.value =
          previousFrameRef.current;
      }
    }
  });

  useEffect(() => {
    return () => {
      if (previousFrameRef.current) {
        previousFrameRef.current.dispose();
      }
      renderTarget.dispose();
    };
  }, [renderTarget]);

  return (
    <shaderMaterial
      ref={materialRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
    />
  );
}

function VideoPlane({
  videoRef,
  gridSize,
  pixelIntensity,
  ditherIntensity,
  chromaticAberration,
  colorShiftSpeed,
  pixelGap,
  ghostingIntensity,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  gridSize: number;
  pixelIntensity: number;
  ditherIntensity: number;
  chromaticAberration: number;
  colorShiftSpeed: number;
  pixelGap: number;
  ghostingIntensity: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  return (
    <mesh ref={meshRef} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <VideoMaterial
        videoRef={videoRef}
        gridSize={gridSize}
        pixelIntensity={pixelIntensity}
        ditherIntensity={ditherIntensity}
        chromaticAberration={chromaticAberration}
        colorShiftSpeed={colorShiftSpeed}
        pixelGap={pixelGap}
        ghostingIntensity={ghostingIntensity}
      />
    </mesh>
  );
}

export default function PixelizedVideoGrid({
  videoSrc,
  gridSize = 40,
  pixelIntensity = 0.8,
  className = "",
  variant = "default",
  ditherIntensity = 0.75,
  chromaticAberration = 0.5,
  colorShiftSpeed = 1.0,
  pixelGap = 0.2,
  ghostingIntensity = 0.3,
}: PixelizedVideoGridProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, 2));

    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.error("Error playing video:", error);
      });
    }
  }, []);

  const containerClasses = useMemo(() => {
    const classes = [styles.container];

    switch (variant) {
      case "fullscreen":
        classes.push(styles.fullscreen);
        break;
      case "halfHeight":
        classes.push(styles.halfHeight);
        break;
      case "fullHeight":
        classes.push(styles.fullHeight);
        break;
      case "square":
        classes.push(styles.square);
        break;
    }

    if (className) {
      classes.push(className);
    }

    return classes.join(" ");
  }, [variant, className]);

  return (
    <div className={containerClasses}>
      <video
        ref={videoRef}
        src={videoSrc}
        loop
        muted
        playsInline
        className={styles.video}
        crossOrigin="anonymous"
      />

      <Canvas
        className={styles.canvas}
        camera={{ position: [0, 0, 1], fov: 75 }}
        dpr={dpr}
      >
        <VideoPlane
          videoRef={videoRef}
          gridSize={gridSize}
          pixelIntensity={pixelIntensity}
          ditherIntensity={ditherIntensity}
          chromaticAberration={chromaticAberration}
          colorShiftSpeed={colorShiftSpeed}
          pixelGap={pixelGap}
          ghostingIntensity={ghostingIntensity}
        />
      </Canvas>
    </div>
  );
}
