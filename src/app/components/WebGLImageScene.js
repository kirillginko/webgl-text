"use client";

import { useEffect, useRef } from "react";
import { Curtains, Plane } from "curtainsjs";

export default function WebGLImageScene({ imagePath }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let curtains = null;

    const vs = `
      precision mediump float;

      attribute vec3 aVertexPosition;
      attribute vec2 aTextureCoord;

      uniform mat4 uMVMatrix;
      uniform mat4 uPMatrix;

      uniform float uScrollEffect;
      uniform float uTime;

      varying vec3 vVertexPosition;
      varying vec2 vTextureCoord;
      varying float vScrollEffect;
      varying float vTime;

      void main() {
        vec3 vertexPosition = aVertexPosition;
        
        // Add more aggressive movement on scroll
        vertexPosition.x += sin(vertexPosition.y * 3.141592) * uScrollEffect * 0.15;
        vertexPosition.y += cos(vertexPosition.x * 3.141592) * uScrollEffect * 0.1;
        
        gl_Position = uPMatrix * uMVMatrix * vec4(vertexPosition, 1.0);
        
        // Varyings
        vVertexPosition = vertexPosition;
        vTextureCoord = aTextureCoord;
        vScrollEffect = uScrollEffect;
        vTime = uTime;
      }
    `;

    const fs = `
      precision mediump float;

      varying vec3 vVertexPosition;
      varying vec2 vTextureCoord;
      varying float vScrollEffect;
      varying float vTime;

      uniform sampler2D uSampler;
      uniform vec2 uResolution;

      void main() {
        vec2 textureCoord = vTextureCoord;
        
        // Increased distortion
        float scrollStrength = abs(vScrollEffect) * 4.0;
        float distortionStrength = 0.3 + scrollStrength * 0.4;
        
        // Enhanced wave effect
        float frequency = 25.0;
        float waveAmplitude = 0.008 * (1.0 + scrollStrength);
        float wave = sin(textureCoord.y * frequency + vTime) * waveAmplitude;
        float wave2 = cos(textureCoord.x * frequency * 0.5 + vTime) * waveAmplitude;
        
        // Stronger drag effect
        vec2 dragEffect = vec2(vScrollEffect * 0.008, vScrollEffect * 0.004);
        
        // Enhanced chromatic aberration
        float rgbSplit = 0.001 * (1.0 + scrollStrength * 3.0);
        vec2 redOffset = textureCoord + vec2(wave + rgbSplit + wave2, wave2) + dragEffect;
        vec2 greenOffset = textureCoord + vec2(wave, wave2 * 0.5) + dragEffect * 0.9;
        vec2 blueOffset = textureCoord + vec2(wave - rgbSplit - wave2, -wave2) + dragEffect * 1.1;

        // Enhanced noise
        float noise = fract(sin(dot(textureCoord + vTime * 0.02, vec2(12.9898, 78.233))) * 43758.5453);
        float noiseStrength = 0.03 * scrollStrength;
        
        // Sample colors with enhanced offsets
        vec4 red = texture2D(uSampler, redOffset + noise * noiseStrength);
        vec4 green = texture2D(uSampler, greenOffset + noise * noiseStrength * 0.8);
        vec4 blue = texture2D(uSampler, blueOffset + noise * noiseStrength * 1.2);

        // Combine channels with enhanced contrast
        vec4 color = vec4(red.r, green.g, blue.b, 1.0);
        
        // Enhanced blur effect on scroll
        float blur = scrollStrength * 0.2;
        vec2 blurOffset = vec2(blur, blur * 0.5);
        color += texture2D(uSampler, textureCoord + blurOffset) * 0.15;
        color += texture2D(uSampler, textureCoord - blurOffset) * 0.15;
        
        gl_FragColor = color;
      }
    `;

    if (canvasRef.current && typeof window !== "undefined") {
      curtains = new Curtains({
        container: canvasRef.current,
        pixelRatio: Math.min(1.5, window.devicePixelRatio),
      });

      const scroll = { value: 0, lastValue: 0, effect: 0 };

      // Create plane
      const params = {
        vertexShader: vs,
        fragmentShader: fs,
        uniforms: {
          time: {
            name: "uTime",
            type: "1f",
            value: 0,
          },
          scrollEffect: {
            name: "uScrollEffect",
            type: "1f",
            value: 0,
          },
          resolution: {
            name: "uResolution",
            type: "2f",
            value: [window.innerWidth, window.innerHeight],
          },
        },
      };

      // Add image plane
      const planeElement = document.createElement("div");
      planeElement.style.width = "100%";
      planeElement.style.height = "100%";
      planeElement.style.position = "absolute";

      const img = document.createElement("img");
      img.src = imagePath;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";

      planeElement.appendChild(img);
      canvasRef.current.appendChild(planeElement);

      const plane = new Plane(curtains, planeElement, params);

      plane.onRender(() => {
        // Update time uniform with slower animation
        plane.uniforms.time.value += 0.005;

        // Enhanced scroll effect calculation
        scroll.lastValue = scroll.value;
        scroll.value = curtains.getScrollValues().y;
        scroll.delta = Math.max(
          -50,
          Math.min(50, scroll.lastValue - scroll.value)
        );
        scroll.effect = curtains.lerp(scroll.effect, scroll.delta, 0.1);

        plane.uniforms.scrollEffect.value = scroll.effect * 0.05;
      });

      // Handle resize
      window.addEventListener("resize", () => {
        plane.uniforms.resolution.value = [
          window.innerWidth,
          window.innerHeight,
        ];
      });
    }

    return () => {
      if (curtains) {
        curtains.dispose();
      }
    };
  }, [imagePath]);

  return (
    <div
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
      }}
    />
  );
}
