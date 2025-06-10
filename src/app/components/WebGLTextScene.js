"use client";

import { useEffect, useRef } from "react";
import { Curtains, Plane, ShaderPass } from "curtainsjs";
import TextTexture from "../shaders/TextTexture";
import styles from "../page.module.css";

export default function WebGLTextScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let curtains = null;

    const vs = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 vVertexPosition;
varying vec2 vTextureCoord;

void main() {
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
    vVertexPosition = aVertexPosition;
    vTextureCoord = aTextureCoord;
}`;

    const fs = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vVertexPosition;
varying vec2 vTextureCoord;

uniform sampler2D uTexture;

void main( void ) {
    gl_FragColor = texture2D(uTexture, vTextureCoord);
}`;

    const scrollFs = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vVertexPosition;
varying vec2 vTextureCoord;

uniform sampler2D uRenderTexture;
uniform float uScrollEffect;
uniform float uScrollStrength;

// Noise function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Blur function
vec4 blur(sampler2D texture, vec2 uv, float blur) {
    vec4 color = vec4(0.0);
    float total = 0.0;
    float offset = random(uv) * 0.012;

    // 9-tap gaussian blur
    vec2 blurCoord = vec2(blur * 0.0025, blur * 0.0025);
    
    color += texture2D(texture, uv);
    color += texture2D(texture, uv + vec2(blurCoord.x, 0.0));
    color += texture2D(texture, uv + vec2(-blurCoord.x, 0.0));
    color += texture2D(texture, uv + vec2(0.0, blurCoord.y));
    color += texture2D(texture, uv + vec2(0.0, -blurCoord.y));
    color += texture2D(texture, uv + vec2(blurCoord.x, blurCoord.y) * 0.7);
    color += texture2D(texture, uv + vec2(-blurCoord.x, blurCoord.y) * 0.7);
    color += texture2D(texture, uv + vec2(blurCoord.x, -blurCoord.y) * 0.7);
    color += texture2D(texture, uv + vec2(-blurCoord.x, -blurCoord.y) * 0.7);
    
    return color / 9.0;
}

void main() {
    vec2 scrollTextCoords = vTextureCoord;
    float horizontalStretch;

    if(uScrollEffect >= 0.0) {
        scrollTextCoords.y *= 1.0 + -uScrollEffect * 0.00625 * uScrollStrength;
        horizontalStretch = sin(scrollTextCoords.y);
    }
    else if(uScrollEffect < 0.0) {
        scrollTextCoords.y += (scrollTextCoords.y - 1.0) * uScrollEffect * 0.00625 * uScrollStrength;
        horizontalStretch = sin(-1.0 * (1.0 - scrollTextCoords.y));
    }

    scrollTextCoords.x = scrollTextCoords.x * 2.0 - 1.0;
    scrollTextCoords.x *= 1.0 + uScrollEffect * 0.0035 * horizontalStretch * uScrollStrength;
    scrollTextCoords.x = (scrollTextCoords.x + 1.0) * 0.5;

    // Add chromatic aberration with wave effect
    float aberrationStrength = abs(uScrollEffect) * 0.0003;
    float noiseIntensity = abs(uScrollEffect) * 0.05 + 0.01;
    
    // Create wave offsets for RGB channels with reduced amplitude
    float waveFrequency = 6.0;
    float waveAmplitude = aberrationStrength * 1.5;
    float timeOffset = uScrollEffect * 0.05;
    
    // Calculate heatmap color based on scroll speed and direction
    vec3 warmColor = vec3(1.0, 0.4, 0.1); // warm orange/red
    vec3 coolColor = vec3(0.1, 0.4, 1.0); // cool blue
    vec3 heatColor = uScrollEffect > 0.0 ? warmColor : coolColor;
    float heatIntensity = abs(uScrollEffect) * 0.05;
    heatIntensity = smoothstep(0.0, 0.8, heatIntensity); // smooth transition
    
    // Add subtle color mixing based on scroll intensity
    float mixFactor = smoothstep(-30.0, 30.0, uScrollEffect) * 0.5 + 0.5;
    heatColor = mix(coolColor, warmColor, mixFactor);
    
    // Calculate wave offsets for each channel
    float redWave = sin(scrollTextCoords.y * waveFrequency + timeOffset) * waveAmplitude;
    float greenWave = sin(scrollTextCoords.y * waveFrequency + timeOffset + 2.094) * waveAmplitude;
    float blueWave = sin(scrollTextCoords.y * waveFrequency + timeOffset + 4.189) * waveAmplitude;
    
    vec2 redOffset = scrollTextCoords + vec2(redWave, aberrationStrength * 0.2);
    vec2 greenOffset = scrollTextCoords + vec2(greenWave, 0.0);
    vec2 blueOffset = scrollTextCoords + vec2(blueWave, -aberrationStrength * 0.2);
    
    // Apply minimal blur
    float blurStrength = abs(uScrollEffect) * 0.15 + 0.2; // Significantly reduced blur
    vec4 red = blur(uRenderTexture, redOffset, blurStrength);
    vec4 green = blur(uRenderTexture, greenOffset, blurStrength);
    vec4 blue = blur(uRenderTexture, blueOffset, blurStrength);
    
    // Add subtle noise
    vec2 noiseCoord = vTextureCoord * 120.0;
    float noise = random(noiseCoord + vec2(uScrollEffect)) * noiseIntensity;
    float dynamicNoise = noise * (1.0 + abs(uScrollEffect) * 0.1);
    
    // Dynamic brightness compensation based on scroll speed
    float scrollFactor = abs(uScrollEffect);
    float brightnessBoost = 1.0 + scrollFactor * 0.04;
    
    // Combine channels with wave effect and brightness compensation
    vec4 finalColor = vec4(
        min(1.0, (red.r + dynamicNoise * 0.3) * brightnessBoost),
        min(1.0, (green.g + dynamicNoise * 0.2) * brightnessBoost),
        min(1.0, (blue.b + dynamicNoise * 0.3) * brightnessBoost),
        (red.a + green.a + blue.a) / 3.0
    );
    
    // Apply heatmap effect
    finalColor.rgb = mix(
        finalColor.rgb,
        finalColor.rgb * heatColor,
        heatIntensity
    );
    
    // Enhanced minimum brightness with smooth transition
    float luminance = dot(finalColor.rgb, vec3(0.299, 0.587, 0.114));
    float minBrightness = 0.6 + scrollFactor * 0.1;
    float smoothFactor = smoothstep(0.0, 0.5, luminance);
    
    if (luminance < minBrightness && finalColor.a > 0.1) {
        float brightnessFactor = mix(minBrightness / max(luminance, 0.001), 1.0, smoothFactor);
        finalColor.rgb = min(finalColor.rgb * brightnessFactor, vec3(1.0));
    }
    
    gl_FragColor = finalColor;
}`;

    // Initialize Curtains
    if (canvasRef.current && typeof window !== "undefined") {
      curtains = new Curtains({
        container: canvasRef.current,
        pixelRatio: Math.min(1.5, window.devicePixelRatio),
      });

      const scroll = { value: 0, lastValue: 0, effect: 0 };

      curtains
        .onSuccess(() => {
          const fonts = {
            list: [
              'normal 400 1em "Archivo Black", sans-serif',
              'normal 300 1em "Merriweather Sans", sans-serif',
            ],
            loaded: 0,
          };

          fonts.list.forEach((font) => {
            document.fonts
              .load(font)
              .then(() => {
                fonts.loaded++;
                if (fonts.loaded === fonts.list.length) {
                  const scrollPass = new ShaderPass(curtains, {
                    fragmentShader: scrollFs,
                    depth: false,
                    uniforms: {
                      scrollEffect: {
                        name: "uScrollEffect",
                        type: "1f",
                        value: scroll.effect,
                      },
                      scrollStrength: {
                        name: "uScrollStrength",
                        type: "1f",
                        value: 2.5,
                      },
                    },
                  });

                  scrollPass.onRender(() => {
                    scroll.lastValue = scroll.value;
                    scroll.value = curtains.getScrollValues().y;
                    scroll.delta = Math.max(
                      -30,
                      Math.min(30, scroll.lastValue - scroll.value)
                    );
                    scroll.effect = curtains.lerp(
                      scroll.effect,
                      scroll.delta,
                      0.05
                    );
                    scrollPass.uniforms.scrollEffect.value = scroll.effect;
                  });

                  const textEls = document.querySelectorAll(".text-plane");
                  textEls.forEach((el) => {
                    const textPlane = new Plane(curtains, el, {
                      vertexShader: vs,
                      fragmentShader: fs,
                    });

                    new TextTexture({
                      plane: textPlane,
                      textElement: textPlane.htmlElement,
                      sampler: "uTexture",
                      resolution: 1.5,
                      skipFontLoading: true,
                    });
                  });
                }
              })
              .catch((error) => {
                console.warn("Font loading failed:", error);
                // Continue without waiting for fonts
                fonts.loaded++;
                if (fonts.loaded === fonts.list.length) {
                  // Initialize without fonts if needed
                }
              });
          });
        })
        .onError(() => {
          console.warn("Curtains WebGL context could not be created");
        });
    }

    // Cleanup function
    return () => {
      if (curtains) {
        curtains.dispose();
      }
    };
  }, []);

  return <div className={styles.canvas} ref={canvasRef} />;
}
