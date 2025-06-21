"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function ModelViewer() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Make background transparent
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);

    // Create environment map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmremGenerator.fromScene(new THREE.Scene()).texture;
    pmremGenerator.dispose();

    scene.environment = environmentMap;
    scene.background = null; // Keep background transparent

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add colored point lights for iridescence
    const redLight = new THREE.PointLight(0xff3333, 2.5);
    redLight.position.set(10, 10, 10);
    scene.add(redLight);

    const pinkLight = new THREE.PointLight(0xff9999, 2);
    pinkLight.position.set(-10, -10, -10);
    scene.add(pinkLight);

    const purpleLight = new THREE.PointLight(0xff6666, 2);
    purpleLight.position.set(0, 10, -10);
    scene.add(purpleLight);

    // Camera position
    camera.position.z = 35;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false; // Disable zoom for better UX
    controls.enabled = false; // Disable controls to keep model centered

    // Load Models
    const loader = new GLTFLoader();
    const modelPaths = [
      "/models/O.glb",
      "/models/B.glb",
      "/models/L.glb",
      "/models/A.glb",
      "/models/S.glb",
      "/models/T.glb",
    ];
    const spacing = 12;
    const totalWidth = spacing * (modelPaths.length - 1);
    const startX = -totalWidth / 2;

    // Load all models
    Promise.all(
      modelPaths.map(
        (path, index) =>
          new Promise((resolve, reject) => {
            loader.load(
              path,
              (gltf) => {
                const model = gltf.scene;

                // Make models reflective with iridescent effect
                model.traverse((child) => {
                  if (child.isMesh) {
                    // Create new iridescent material
                    const material = new THREE.MeshPhysicalMaterial({
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
                      transmission: 0.05,
                    });
                    child.material = material;
                  }
                });

                // Center each model
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center);

                // Position model in row
                model.position.set(startX + spacing * index, 0, 0);

                // Scale the model
                const scale = 5.55;
                model.scale.set(scale, scale, scale);

                // Initial rotation - align letters to face forward
                model.rotation.x = 0.2;
                model.rotation.y = index * ((Math.PI * 2) / 4); // Evenly space initial rotations
                model.rotation.z = 0;

                scene.add(model);
                resolve(model);
              },
              undefined,
              (error) => {
                console.error(`Error loading model ${path}:`, error);
                reject(error);
              }
            );
          })
      )
    ).then((models) => {
      // Animation variables
      let time = 0;

      // Animate all models
      const animate = () => {
        requestAnimationFrame(animate);
        time += 0.02;

        models.forEach((model, index) => {
          // Spin animation
          model.rotation.y += 0.02;

          // Add slight floating motion
          model.position.y = Math.sin(time + index * 0.5) * 0.3;

          // Update iridescent effect
          model.traverse((child) => {
            if (child.isMesh) {
              // Smoothly shift the iridescence properties
              child.material.iridescenceIOR = 1.8 + Math.sin(time * 0.5) * 0.4;
              child.material.sheen = 0.8 + Math.sin(time * 0.3) * 0.2;
              // Shift between lighter red hues
              const hue = Math.sin(time * 0.2) * 0.05 + 0.0;
              const saturation = 0.6 + Math.sin(time * 0.3) * 0.2;
              const lightness = 0.7 + Math.sin(time * 0.25) * 0.1;
              child.material.color.setHSL(hue, saturation, lightness);
            }
          });
        });

        renderer.render(scene, camera);
      };
      animate();
    });

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      container?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none", // Allow clicking through to text
        zIndex: 1, // Position between text and WebGL text effect
        overflow: "hidden", // Prevent any potential scrolling
      }}
    />
  );
}
