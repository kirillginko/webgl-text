"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  useGLTF,
  useVideoTexture,
  OrbitControls,
  Box,
} from "@react-three/drei";
import styles from "./TabletVideo.module.css";

interface TabletVideoDebugProps {
  videoSrc?: string;
  tabletPath?: string;
  className?: string;
  targetMeshId?: number; // Allow targeting by Three.js mesh ID (not array index)
  targetMeshName?: string; // Allow targeting by mesh name
}

// Add shader code before the DebugTabletModel component
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

function DebugTabletModel({
  videoSrc = "/willow.mp4",
  tabletPath = "/models/tablet.glb",
  targetMeshId,
  targetMeshName,
}: {
  videoSrc: string;
  tabletPath: string;
  targetMeshId?: number;
  targetMeshName?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Load the tablet model
  const { scene } = useGLTF(tabletPath);

  // Load video texture
  const videoTexture = useVideoTexture(videoSrc, {
    muted: true,
    loop: true,
    start: true,
  });

  // Debug video element
  useEffect(() => {
    if (videoTexture) {
      console.log("📺 Video texture loaded:", videoTexture);
      const video = videoTexture.image;
      console.log("📺 Video element:", video);
      if (video instanceof HTMLVideoElement) {
        console.log("📺 Video properties:", {
          currentTime: video.currentTime,
          duration: video.duration,
          paused: video.paused,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
      }
    }
  }, [videoTexture]);

  useEffect(() => {
    console.log("=== TABLET DEBUG INFO ===");
    console.log("Model path:", tabletPath);
    console.log("Video path:", videoSrc);
    console.log("Scene loaded:", !!scene);
    console.log("Video texture:", videoTexture);
    console.log("Target mesh ID:", targetMeshId);
    console.log("Target mesh name:", targetMeshName);

    if (scene) {
      console.log("Scene object:", scene);
      console.log("Scene children:", scene.children);

      const allMeshes: THREE.Mesh[] = [];
      let screenFound = false;
      let targetMesh: THREE.Mesh | null = null;

      // Collect all meshes and display comprehensive information
      console.log("🔍 ANALYZING ALL MESHES:");
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          allMeshes.push(child);
        }
      });

      // Display all meshes with their indices and properties
      allMeshes.forEach((mesh, index) => {
        // Calculate mesh properties
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox!;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = bbox.getCenter(new THREE.Vector3());

        // Calculate flatness ratio (how flat the surface is)
        const flatnessRatio =
          Math.min(size.x, size.y, size.z) / Math.max(size.x, size.y, size.z);
        const area = size.x * size.y; // Approximate surface area

        console.log(`📦 MESH ${index}:`);
        console.log(`  Name: "${mesh.name || "unnamed"}"`);
        console.log(`  ID: ${mesh.id}`);
        console.log(`  UUID: ${mesh.uuid}`);
        console.log(
          `  Dimensions: ${size.x.toFixed(3)} x ${size.y.toFixed(
            3
          )} x ${size.z.toFixed(3)}`
        );
        console.log(
          `  Flatness: ${flatnessRatio.toFixed(3)} (closer to 0 = flatter)`
        );
        console.log(`  Area: ${area.toFixed(3)}`);
        console.log(
          `  Center: ${center.x.toFixed(3)}, ${center.y.toFixed(
            3
          )}, ${center.z.toFixed(3)}`
        );
        console.log(`  Vertices: ${mesh.geometry.attributes.position.count}`);
        console.log(
          `  Material: ${(mesh.material as THREE.Material)?.constructor.name}`
        );

        // Check if this looks like a screen (flat and rectangular)
        const isFlat = flatnessRatio < 0.1;
        const isReasonableSize = area > 0.01 && area < 10;
        const aspectRatio = Math.max(size.x, size.y) / Math.min(size.x, size.y);
        const isScreenLike =
          isFlat && isReasonableSize && aspectRatio > 1.2 && aspectRatio < 3;

        if (isScreenLike) {
          console.log(
            `  🖥️ LOOKS LIKE A SCREEN! (flat=${isFlat}, size=${isReasonableSize}, aspect=${aspectRatio.toFixed(
              2
            )})`
          );
        }

        console.log(`  ---`);
      });

      // Target selection logic for ORIGINAL scene (just for analysis)
      console.log(
        `🔍 Looking for target - ID: ${targetMeshId}, Name: ${targetMeshName}`
      );
      console.log(
        `📊 Total meshes found in ORIGINAL scene: ${allMeshes.length}`
      );
      console.log(
        `📋 Available mesh IDs in ORIGINAL scene: ${allMeshes
          .map((m) => m.id)
          .join(", ")}`
      );

      if (targetMeshId !== undefined) {
        // Find mesh by Three.js ID (not array index) in original scene
        const foundMesh = allMeshes.find((mesh) => mesh.id === targetMeshId);
        if (foundMesh) {
          targetMesh = foundMesh;
          screenFound = true;
          const arrayIndex = allMeshes.indexOf(foundMesh);
          console.log(
            `🎯 FOUND IN ORIGINAL: Mesh ID ${targetMeshId} (array index ${arrayIndex}, name: ${
              targetMesh.name || "unnamed"
            })`
          );
        } else {
          console.log(
            `ℹ️ Mesh ID ${targetMeshId} not in original scene (will search in cloned scene later)`
          );
          // Don't error here - the ID might exist in the cloned scene
        }
      } else if (
        targetMeshName &&
        allMeshes.find((m) => m.name === targetMeshName)
      ) {
        targetMesh = allMeshes.find((m) => m.name === targetMeshName)!;
        screenFound = true;
        console.log(`🎯 TARGETING BY NAME: ${targetMeshName}`);
      } else {
        // Fallback: find the most screen-like mesh
        let bestScreenMesh: THREE.Mesh | null = null;
        let bestScreenScore = 0;

        allMeshes.forEach((mesh, index) => {
          mesh.geometry.computeBoundingBox();
          const bbox = mesh.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);

          const flatnessRatio =
            Math.min(size.x, size.y, size.z) / Math.max(size.x, size.y, size.z);
          const area = size.x * size.y;
          const aspectRatio =
            Math.max(size.x, size.y) / Math.min(size.x, size.y);

          // Score based on screen-like properties
          const isFlat = flatnessRatio < 0.1;
          const isReasonableSize = area > 0.01 && area < 10;
          const hasGoodAspect = aspectRatio > 1.2 && aspectRatio < 3;

          let score = 0;
          if (isFlat) score += 3;
          if (isReasonableSize) score += 2;
          if (hasGoodAspect) score += 2;
          score += area; // Prefer larger screens

          console.log(
            `📊 Mesh ${index} screen score: ${score.toFixed(
              2
            )} (flat=${isFlat}, size=${isReasonableSize}, aspect=${hasGoodAspect})`
          );

          if (score > bestScreenScore) {
            bestScreenScore = score;
            bestScreenMesh = mesh;
          }
        });

        if (bestScreenMesh) {
          targetMesh = bestScreenMesh;
          screenFound = true;
          const targetIndex = allMeshes.indexOf(targetMesh);
          console.log(
            `🎯 FALLBACK: Auto-detected screen mesh ${targetIndex} (${
              (targetMesh as THREE.Mesh).name || "unnamed"
            }) with score ${bestScreenScore.toFixed(2)}`
          );
        } else {
          // Last resort: use largest mesh
          let largestArea = 0;
          allMeshes.forEach((mesh) => {
            mesh.geometry.computeBoundingBox();
            const bbox = mesh.geometry.boundingBox!;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const area = size.x * size.y;

            if (area > largestArea) {
              largestArea = area;
              targetMesh = mesh;
            }
          });

          if (targetMesh) {
            screenFound = true;
            const targetIndex = allMeshes.indexOf(targetMesh);
            console.log(
              `🎯 LAST RESORT: Using largest mesh ${targetIndex} (${
                (targetMesh as THREE.Mesh).name || "unnamed"
              })`
            );
          }
        }
      }

      // Create debug materials for visualization
      const debugMaterials = [
        new THREE.MeshPhysicalMaterial({ color: 0xff0000, wireframe: true }), // Red wireframe
        new THREE.MeshPhysicalMaterial({ color: 0x00ff00, wireframe: true }), // Green wireframe
        new THREE.MeshPhysicalMaterial({ color: 0x0000ff, wireframe: true }), // Blue wireframe
        new THREE.MeshPhysicalMaterial({ color: 0xffff00, wireframe: true }), // Yellow wireframe
      ];

      // Store the target mesh info for applying after cloning
      if (screenFound && targetMesh) {
        const targetIndex = allMeshes.indexOf(targetMesh);
        console.log(
          `🎯 FOUND TARGET: mesh ${targetIndex}, ID ${targetMesh.id}: ${
            targetMesh.name || "unnamed"
          }`
        );
      }

      // Apply debug materials to other meshes for visibility
      allMeshes.forEach((mesh, index) => {
        if (mesh !== targetMesh) {
          const debugMat = debugMaterials[index % debugMaterials.length];
          mesh.material = debugMat;
          console.log(
            `📱 Mesh ${index}: ${mesh.name || "unnamed"} - debug wireframe`
          );
        } else {
          console.log(
            `🎯 Mesh ${index}: ${mesh.name || "unnamed"} - VIDEO SURFACE ⭐`
          );
        }
      });

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log("Model size:", size);
      console.log("Model center:", center);
    }
  }, [scene, tabletPath, videoSrc, videoTexture]);

  // Apply video material to the cloned scene
  useEffect(() => {
    if (groupRef.current && scene && videoTexture) {
      console.log("🎬 APPLYING VIDEO MATERIAL TO CLONED SCENE");

      // Find the cloned scene object
      const clonedScene = groupRef.current.children.find(
        (child) =>
          child.type === "Group" ||
          child.type === "Scene" ||
          child.type === "Object3D"
      );

      if (!clonedScene) {
        console.log("❌ No cloned scene found in group");
        return;
      }

      console.log("📦 Found cloned scene:", clonedScene);

      // Find all meshes in the cloned scene
      const clonedMeshes: THREE.Mesh[] = [];
      clonedScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          clonedMeshes.push(child);
        }
      });

      console.log(`📊 Found ${clonedMeshes.length} meshes in cloned scene`);

      // Analyze ALL meshes and find screen candidates
      const screenCandidates: {
        mesh: THREE.Mesh;
        score: number;
        reason: string;
      }[] = [];

      clonedMeshes.forEach((mesh, index) => {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox!;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = bbox.getCenter(new THREE.Vector3());

        const flatnessRatio =
          Math.min(size.x, size.y, size.z) / Math.max(size.x, size.y, size.z);
        const area = size.x * size.y;
        const aspectRatio = Math.max(size.x, size.y) / Math.min(size.x, size.y);

        // Score based on screen-like properties
        let score = 0;
        const reasons = [];

        if (flatnessRatio < 0.05) {
          score += 5;
          reasons.push("very flat");
        } else if (flatnessRatio < 0.1) {
          score += 3;
          reasons.push("flat");
        }

        if (area > 0.1 && area < 5) {
          score += 3;
          reasons.push("good size");
        }
        if (aspectRatio > 1.2 && aspectRatio < 2.5) {
          score += 2;
          reasons.push("screen aspect");
        }

        // Prefer meshes that are more towards the front/top of the tablet
        if (center.z > 0) {
          score += 2;
          reasons.push("front position");
        }
        if (center.y > -0.1) {
          score += 1;
          reasons.push("top position");
        }

        // Extra points for meshes that are clearly on top (likely the screen)
        if (center.y > 0.05 && center.z > 0.05) {
          score += 3;
          reasons.push("TOP SURFACE - LIKELY SCREEN");
        }

        const reason = reasons.join(", ");

        console.log(
          `🔍 Mesh ${index} (ID: ${mesh.id}): score=${score.toFixed(
            1
          )} (${reason})`
        );
        console.log(
          `  - Flatness: ${flatnessRatio.toFixed(3)}, Area: ${area.toFixed(
            3
          )}, Aspect: ${aspectRatio.toFixed(2)}`
        );
        console.log(
          `  - Center: ${center.x.toFixed(2)}, ${center.y.toFixed(
            2
          )}, ${center.z.toFixed(2)}`
        );

        if (score > 3) {
          screenCandidates.push({ mesh, score, reason });
        }
      });

      console.log(`🖥️ Found ${screenCandidates.length} screen candidates`);
      screenCandidates.sort((a, b) => b.score - a.score);

      // Find target mesh by ID or use best candidate
      let targetClonedMesh: THREE.Mesh | null = null;
      console.log(
        `📋 Available mesh IDs in CLONED scene: ${clonedMeshes
          .map((m) => m.id)
          .join(", ")}`
      );

      if (targetMeshId !== undefined) {
        targetClonedMesh =
          clonedMeshes.find((mesh) => mesh.id === targetMeshId) || null;
        if (targetClonedMesh) {
          console.log(
            `🎯 SUCCESS! Found target mesh ${targetMeshId} in cloned scene`
          );
        } else {
          console.log(
            `❌ Target mesh ${targetMeshId} not found in cloned scene`
          );
          console.log(`🔄 Will use auto-detection fallback`);
        }
      }

      if (!targetClonedMesh && screenCandidates.length > 0) {
        targetClonedMesh = screenCandidates[0].mesh;
        console.log(
          `🔄 Auto-selected best screen candidate: ${targetClonedMesh.id} (score: ${screenCandidates[0].score})`
        );
      } else if (!targetClonedMesh) {
        console.log(
          `❌ No target mesh found - will apply video to first mesh as fallback`
        );
        targetClonedMesh = clonedMeshes[0] || null;
      }

      // Store original materials before any modifications
      const originalMaterials = new Map<
        THREE.Mesh,
        THREE.Material | THREE.Material[]
      >();
      clonedMeshes.forEach((mesh) => {
        originalMaterials.set(mesh, mesh.material);
      });

      // Only apply debug coloring to non-target screen candidates (optional)
      console.log(
        "🎨 DEBUG: Screen candidates found (keeping original materials)"
      );
      screenCandidates.forEach((candidate) => {
        console.log(
          `🖥️ Screen candidate ${
            candidate.mesh.id
          }: score ${candidate.score.toFixed(1)} (${candidate.reason})`
        );
      });

      // Just log which meshes have video applied
      console.log("📺 MESHES WITH VIDEO APPLIED:");
      clonedMeshes.forEach((mesh, index) => {
        if (mesh.material && (mesh.material as THREE.MeshBasicMaterial).map) {
          console.log(
            `📺 Mesh ID ${mesh.id} (index ${index}) has video material`
          );
        }
      });

      // Replace the video material creation with the shader material
      if (targetClonedMesh) {
        console.log(`🎬 APPLYING VIDEO to cloned mesh ${targetClonedMesh.id}`);

        // Create previous frame texture
        const previousFrameTexture = new THREE.VideoTexture(videoTexture.image);
        previousFrameTexture.flipY = false;
        previousFrameTexture.wrapS = THREE.ClampToEdgeWrapping;
        previousFrameTexture.wrapT = THREE.ClampToEdgeWrapping;
        previousFrameTexture.needsUpdate = true;

        // Create shader material with uniforms
        const shaderMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uTexture: { value: videoTexture },
            uPrevFrame: { value: previousFrameTexture },
            uTime: { value: 0 },
            uGridSize: { value: 180.0 }, // Adjust this value to change pixelation
            uPixelIntensity: { value: 0.8 },
            uDitherIntensity: { value: 0.75 },
            uChromaticAberration: { value: 0.5 },
            uColorShiftSpeed: { value: 0.0 },
            uPixelGap: { value: 0.2 },
            uGhostingIntensity: { value: 0.3 },
            uResolution: { value: new THREE.Vector2(1, 1) },
          },
          vertexShader,
          fragmentShader,
          side: THREE.DoubleSide,
        });

        // Update time uniform in animation loop
        const animate = () => {
          shaderMaterial.uniforms.uTime.value = performance.now() / 1000;
          requestAnimationFrame(animate);
        };
        animate();

        targetClonedMesh.material = shaderMaterial;
        targetClonedMesh.material.needsUpdate = true;

        console.log(`✅ Shader material applied successfully`);

        // Restore original materials for all other meshes
        clonedMeshes.forEach((mesh) => {
          if (mesh !== targetClonedMesh) {
            const originalMaterial = originalMaterials.get(mesh);
            if (originalMaterial) {
              mesh.material = originalMaterial;
            }
          }
        });
        console.log(`🎨 Restored original materials for non-target meshes`);
      } else {
        console.log(`❌ No suitable target mesh found in cloned scene`);
      }
    }
  }, [groupRef.current, scene, videoTexture, targetMeshId]);

  // No automatic rotation

  if (!scene) {
    return (
      <group ref={groupRef}>
        {/* Loading placeholder */}
        <Box args={[1, 1, 1]} position={[0, 0, 0]}>
          <meshBasicMaterial color="red" />
        </Box>
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      {/* Tablet model with video applied to screen surface */}
      <primitive
        object={scene.clone()}
        scale={[0.6, 0.6, 0.6]}
        position={[0, 0, 0]}
        rotation={[0.1, 0, 0]} // Slight tilt for better view
      />

      {/* Debug floating plane removed to see actual mesh targeting */}
    </group>
  );
}

function DebugScene({
  videoSrc,
  tabletPath,
  targetMeshId,
  targetMeshName,
}: {
  videoSrc: string;
  tabletPath: string;
  targetMeshId?: number;
  targetMeshName?: string;
}) {
  return (
    <>
      {/* Bright, even lighting setup */}
      <ambientLight intensity={2.0} /> {/* Much brighter ambient light */}
      {/* Main front light */}
      <directionalLight
        position={[0, 2, 5]}
        intensity={1.5}
        castShadow={false}
      />
      {/* Strong back lights */}
      <directionalLight
        position={[0, 2, -5]}
        intensity={1.5}
        castShadow={false}
      />
      <directionalLight
        position={[0, -2, -5]}
        intensity={1.5}
        castShadow={false}
      />
      {/* Top and bottom fill lights */}
      <directionalLight
        position={[0, 5, 0]}
        intensity={1.0}
        castShadow={false}
      />
      <directionalLight
        position={[0, -5, 0]}
        intensity={1.0}
        castShadow={false}
      />
      {/* Strong rim lights */}
      <pointLight position={[5, 0, -2]} intensity={1.0} color="#ffffff" />
      <pointLight position={[-5, 0, -2]} intensity={1.0} color="#ffffff" />
      {/* Additional fill lights for dark spots */}
      <pointLight position={[0, 0, -5]} intensity={1.0} color="#ffffff" />
      <pointLight position={[0, -2, -3]} intensity={1.0} color="#ffffff" />
      {/* Tablet model */}
      <DebugTabletModel
        videoSrc={videoSrc}
        tabletPath={tabletPath}
        targetMeshId={targetMeshId}
        targetMeshName={targetMeshName}
      />
      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={20}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.5}
        minPolarAngle={Math.PI / 6}
        enableZoom={true}
        zoomSpeed={1}
      />
    </>
  );
}

export default function TabletVideoDebug({
  videoSrc = "/willow.mp4",
  tabletPath = "/models/tablet.glb",
  className = "",
  targetMeshId,
  targetMeshName,
}: TabletVideoDebugProps) {
  useEffect(() => {
    console.log("TabletVideoDebug component mounted");
  }, []);

  return (
    <div className={`${styles.container} ${className}`}>
      <Canvas
        className={styles.canvas}
        camera={{
          position: [0, 0.5, 3],
          fov: 35,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#000"]} />
        <DebugScene
          videoSrc={videoSrc}
          tabletPath={tabletPath}
          targetMeshId={targetMeshId}
          targetMeshName={targetMeshName}
        />
      </Canvas>
    </div>
  );
}

// Preload the tablet model
useGLTF.preload("/models/tablet.glb");
