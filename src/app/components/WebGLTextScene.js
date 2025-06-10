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
uniform vec2 uResolution;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

vec2 fluid_noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);
    float noise = mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    
    return vec2(noise, noise * 1.2);
}

vec4 inkDiffusion(sampler2D texture, vec2 uv, float strength) {
    vec2 pixel = 1.0 / uResolution;
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    for(float i = -2.0; i <= 2.0; i++) {
        for(float j = -2.0; j <= 2.0; j++) {
            vec2 offset = vec2(i, j) * pixel * strength;
            vec2 noise_offset = fluid_noise(uv * 10.0 + offset) * strength * 0.2;
            vec2 sample_pos = uv + offset + noise_offset;
            
            float weight = 1.0 - length(vec2(i, j)) * 0.1;
            weight = max(0.0, weight);
            
            color += texture2D(texture, sample_pos) * weight;
            total += weight;
        }
    }
    
    return color / total;
}

vec4 inkBlur(sampler2D texture, vec2 uv, float blur) {
    vec4 color = vec4(0.0);
    float total = 0.0;
    float offset = random(uv) * 0.012;
    
    vec2 fluidOffset = fluid_noise(uv * 5.0 + vec2(uScrollEffect * 0.1)) * blur * 0.3;
    vec2 blurCoord = vec2(blur * 0.003, blur * 0.003);
    vec2 baseUV = uv + fluidOffset;
    
    color += texture2D(texture, baseUV);
    color += texture2D(texture, baseUV + vec2(blurCoord.x, 0.0));
    color += texture2D(texture, baseUV + vec2(-blurCoord.x, 0.0));
    color += texture2D(texture, baseUV + vec2(0.0, blurCoord.y));
    color += texture2D(texture, baseUV + vec2(0.0, -blurCoord.y));
    color += texture2D(texture, baseUV + vec2(blurCoord.x, blurCoord.y) * 0.7);
    color += texture2D(texture, baseUV + vec2(-blurCoord.x, blurCoord.y) * 0.7);
    color += texture2D(texture, baseUV + vec2(blurCoord.x, -blurCoord.y) * 0.7);
    color += texture2D(texture, baseUV + vec2(-blurCoord.x, -blurCoord.y) * 0.7);
    
    return color / 9.0;
}

void main() {
    vec2 scrollTextCoords = vTextureCoord;
    float horizontalStretch;

    vec2 fluidDistortion = fluid_noise(scrollTextCoords * 6.0 + uScrollEffect * 0.05) * abs(uScrollEffect) * 0.005;
    scrollTextCoords += fluidDistortion;

    if(uScrollEffect >= 0.0) {
        scrollTextCoords.y *= 1.0 + -uScrollEffect * 0.002 * uScrollStrength;
        horizontalStretch = sin(scrollTextCoords.y);
    }
    else if(uScrollEffect < 0.0) {
        scrollTextCoords.y += (scrollTextCoords.y - 1.0) * uScrollEffect * 0.002 * uScrollStrength;
        horizontalStretch = sin(-1.0 * (1.0 - scrollTextCoords.y));
    }

    scrollTextCoords.x = scrollTextCoords.x * 2.0 - 1.0;
    scrollTextCoords.x *= 1.0 + uScrollEffect * 0.001 * horizontalStretch * uScrollStrength;
    scrollTextCoords.x = (scrollTextCoords.x + 1.0) * 0.5;

    float aberrationStrength = abs(uScrollEffect) * 0.0001;
    float noiseIntensity = abs(uScrollEffect) * 0.015 + 0.005;
    
    float waveFrequency = 0.0005;
    float waveAmplitude = aberrationStrength * 0.75;
    float timeOffset = uScrollEffect * 0.02;
    
    vec3 warmColor = vec3(1.0, 0.4, 0.1);
    vec3 coolColor = vec3(0.1, 0.4, 1.0);
    vec3 heatColor = uScrollEffect > 0.0 ? warmColor : coolColor;
    float heatIntensity = abs(uScrollEffect) * 0.05;
    heatIntensity = smoothstep(0.0, 0.8, heatIntensity);
    
    float mixFactor = smoothstep(-30.0, 30.0, uScrollEffect) * 0.5 + 0.5;
    heatColor = mix(coolColor, warmColor, mixFactor);
    
    float redWave = sin(scrollTextCoords.y * waveFrequency + timeOffset) * waveAmplitude;
    float greenWave = sin(scrollTextCoords.y * waveFrequency + timeOffset + 2.094) * waveAmplitude;
    float blueWave = sin(scrollTextCoords.y * waveFrequency + timeOffset + 4.189) * waveAmplitude;
    
    vec2 redOffset = scrollTextCoords + vec2(redWave, aberrationStrength * 0.1);
    vec2 greenOffset = scrollTextCoords + vec2(greenWave, 0.0);
    vec2 blueOffset = scrollTextCoords + vec2(blueWave, -aberrationStrength * 0.1);
    
    float inkStrength = abs(uScrollEffect) * 0.05 + 0.1;
    vec4 red = inkBlur(uRenderTexture, redOffset, inkStrength);
    vec4 green = inkBlur(uRenderTexture, greenOffset, inkStrength);
    vec4 blue = inkBlur(uRenderTexture, blueOffset, inkStrength);
    
    float diffusionStrength = abs(uScrollEffect) * 0.15 + 0.03;
    red = inkDiffusion(uRenderTexture, redOffset, diffusionStrength);
    green = inkDiffusion(uRenderTexture, greenOffset, diffusionStrength);
    blue = inkDiffusion(uRenderTexture, blueOffset, diffusionStrength);
    
    vec2 noiseCoord = vTextureCoord * 120.0;
    float noise = random(noiseCoord + vec2(uScrollEffect)) * noiseIntensity;
    float dynamicNoise = noise * (1.0 + abs(uScrollEffect) * 0.1);
    
    float scrollFactor = abs(uScrollEffect);
    float brightnessBoost = 1.0 + scrollFactor * 0.04;
    
    vec4 finalColor = vec4(
        min(1.0, (red.r + dynamicNoise * 0.3) * brightnessBoost),
        min(1.0, (green.g + dynamicNoise * 0.2) * brightnessBoost),
        min(1.0, (blue.b + dynamicNoise * 0.3) * brightnessBoost),
        (red.a + green.a + blue.a) / 3.0
    );
    
    finalColor.rgb = mix(
        finalColor.rgb,
        finalColor.rgb * heatColor,
        heatIntensity
    );
    
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
                      resolution: {
                        name: "uResolution",
                        type: "2f",
                        value: [
                          curtains.renderer.canvas.width,
                          curtains.renderer.canvas.height,
                        ],
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
                    scrollPass.uniforms.resolution.value = [
                      curtains.renderer.canvas.width,
                      curtains.renderer.canvas.height,
                    ];
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
