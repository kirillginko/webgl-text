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

    gl_FragColor = texture2D(uRenderTexture, scrollTextCoords);
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
