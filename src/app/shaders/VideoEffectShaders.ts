export const videoEffectVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const videoEffectFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec2 uMousePosition;
  uniform float uMouseMoveStrength;
  uniform vec2 uTrailPositions[60];
  uniform float uTrailStrengths[60];
  uniform vec2 uTrailDirections[60];

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    
    // --- VIRTUAL INTERACTION AREA ---
    // Define a "virtual" bounding box around the video plane (0.0 to 1.0)
    // This allows effects to start before the mouse is directly over the video
    float extendedArea = 0.4; // Increased from 0.2 for a larger area
    vec2 closestPoint = vec2(
      clamp(uv.x, -extendedArea, 1.0 + extendedArea),
      clamp(uv.y, -extendedArea, 1.0 + extendedArea)
    );
    float distanceFromMouse = distance(uMousePosition, closestPoint);

    // --- EXPONENTIAL FALLOFF ---
    float falloffDistance = 0.4 + extendedArea;
    float normalizedDistance =
      clamp(distanceFromMouse / falloffDistance, 0.0, 1.0);
    float exponentialFalloff = pow(1.0 - normalizedDistance, 4.0);

    // Initialize displacement variables
    float displacement = 0.0;
    vec2 direction = vec2(0.0, 0.0);
    
    // Only calculate displacement effects when mouse is actively moving
    if (uMouseMoveStrength > 0.08) {
      // Create much stronger flowing wave patterns with larger scale
      vec2 flowOffset = vec2(
        sin(uTime * 0.4) * 0.3,  // Reduced amplitude from 0.5 to 0.3
        cos(uTime * 0.3) * 0.3
      );
      vec2 offsetPos = uMousePosition + flowOffset;
      
      // Calculate multiple distance fields with smaller offsets for tighter effect
      float dist1 = distance(uv + vec2(0.15, 0.15), offsetPos);  // Reduced from 0.25 to 0.15
      float dist2 = distance(uv + vec2(-0.15, -0.15), offsetPos);
      float dist3 = distance(uv + vec2(-0.15, 0.15), offsetPos);
      float dist4 = distance(uv + vec2(0.15, -0.15), offsetPos);
      
      // Create intense overlapping waves with tighter reach
      float wave1 = sin(2.5 * (dist1 - (uTime / 20.0))) * smoothstep(0.4, 0.0, dist1);  // Reduced range from 0.8 to 0.4
      float wave2 = cos(2.8 * (dist2 - (uTime / 15.0))) * smoothstep(0.4, 0.0, dist2);
      float wave3 = sin(3.0 * (dist3 - (uTime / 10.0))) * smoothstep(0.4, 0.0, dist3);
      float wave4 = cos(3.2 * (dist4 - (uTime / 5.0))) * smoothstep(0.4, 0.0, dist4);
      
      // Amplified noise pattern with smaller scale
      float noise1 = sin(uv.x * 4.0 + uTime * 1.2 + uv.y * 3.0) * 0.5;  // Reduced from 0.9 to 0.5
      float noise2 = cos(uv.y * 4.0 + uTime * 1.0 + uv.x * 3.0) * 0.5;
      float noise3 = sin((uv.x + uv.y) * 5.0 + uTime * 1.1) * 0.5;
      float organicNoise = (noise1 + noise2 + noise3) / 3.0;
      
      // Combine waves with reduced intensity
      displacement = (wave1 + wave2 + wave3 + wave4) * 0.45;
      displacement =
        displacement *
        (1.0 + organicNoise) *
        uMouseMoveStrength *
        1.5;
      
      // Create intense flowing displacement field with smaller scale
      vec2 flow1 = vec2(
        sin(uv.y * 2.0 + uTime * 1.0) * 0.8,  // Reduced from 1.5 to 0.8
        cos(uv.x * 2.0 + uTime * 0.8) * 0.8
      );
      vec2 flow2 = vec2(
        cos(uv.x * 1.8 - uTime * 0.6) * 0.8,
        sin(uv.y * 1.8 - uTime * 0.8) * 0.8
      );
      
      // Combine flows with tighter transition
      float flowMix = smoothstep(0.4, 0.0, distanceFromMouse);  // Reduced range from 0.8 to 0.4
      direction = normalize(mix(flow1, flow2, flowMix)) * 0.8;  // Reduced from 1.5 to 0.8
    }
    
    // Keep original UV for base video
    vec2 displacedUV = uv;
    
    // Apply displacement to UV coordinates when there's movement
    if (uMouseMoveStrength > 0.08) {
        // Apply the displacement effect to UV coordinates with reduced effect
        displacedUV += direction * displacement * 0.4;  // Reduced from 0.8 to 0.4
    }
    
    // BLOCKY PIXELATED TRAIL EFFECT
    // Add a strong pixelation effect on hover, separate from movement
    float hoverPixelation = exponentialFalloff * 0.6; // Base pixelation for hover

    // Calculate movement-based effect
    float movementEffect = exponentialFalloff * uMouseMoveStrength * 3.0;

    // Combine hover and movement effects
    float pixelationStrength = hoverPixelation + movementEffect;
    
    // Create trail decay over time and distance
    float trailDecay = exp(-distanceFromMouse * 4.0) * smoothstep(0.0, 0.1, uMouseMoveStrength);
    pixelationStrength = max(pixelationStrength, trailDecay * 0.8);
    
    // When hovering with minimal movement, boost pixelation to hide subtle ripples
    if (uMouseMoveStrength < 0.1 && exponentialFalloff > 0.1) {
      pixelationStrength = max(pixelationStrength, exponentialFalloff * 0.9);
    }
    
    // Apply pixelation to the displaced UV coordinates
    vec2 pixelatedUV = displacedUV;  // Start with displaced coordinates
    
    // ENHANCED DIRECTIONAL TRAIL SYSTEM - Check all trail positions with directional extension
    float maxTrailEffect = 0.0;
    for (int i = 0; i < 60; i++) {
      if (uTrailStrengths[i] > 0.01) {
        vec2 trailPos = uTrailPositions[i];
        vec2 trailDir = uTrailDirections[i];
        
        // Create directional trail extension
        vec2 toPixel = uv - trailPos;
        float distanceToTrail = length(toPixel);
        
        // Check if pixel is in the direction opposite to movement (behind the trail)
        float directionAlignment = dot(normalize(toPixel), -trailDir);
        
        // Create extended trail effect in the direction the mouse came from
        float directionalEffect = 0.0;
        if (directionAlignment > 0.3 && distanceToTrail < 0.25) {
          // Stronger effect for pixels behind the trail point
          directionalEffect = smoothstep(0.25, 0.0, distanceToTrail) * 
                            smoothstep(0.3, 0.8, directionAlignment) * 
                            uTrailStrengths[i] * 0.8;
        }
        
        // Regular circular trail effect
        float circularEffect = smoothstep(0.12, 0.0, distanceToTrail) * uTrailStrengths[i];
        
        // Combine both effects
        float trailEffect = max(directionalEffect, circularEffect);
        maxTrailEffect = max(maxTrailEffect, trailEffect);
      }
    }
    pixelationStrength = max(pixelationStrength, maxTrailEffect);
    
    // Base pixel size - smaller numbers = bigger pixels (more blocky)
    float basePixelSize = 200.0;
    float minPixelSize = 25.0; // Increased from 8.0 for smaller blocks
    float maxPixelSize = 150.0; // Less pixelated maximum
    
    // Calculate dynamic pixel size based on effect strength
    float pixelSize = basePixelSize - (pixelationStrength * (basePixelSize - minPixelSize));
    pixelSize = max(pixelSize, minPixelSize);
    
    // Apply main pixelation effect - always apply when mouse is nearby
    if (pixelationStrength > 0.01 || exponentialFalloff > 0.05) {
      // Create main blocky pixel grid
      vec2 pixelCoord = floor(displacedUV * pixelSize) / pixelSize;
      pixelCoord += 0.5 / pixelSize; // Center the pixel
      
      // Mix based on pixelation strength with minimum effect
      float actualPixelStrength = max(pixelationStrength, 0.3);
      displacedUV = mix(displacedUV, pixelCoord, actualPixelStrength);
    }
    
    // ENHANCED MULTI-LAYERED TRAIL SYSTEM WITH PERSISTENT TRAILS
    vec2 trailUV1 = displacedUV;
    vec2 trailUV2 = displacedUV;
    vec2 trailUV3 = displacedUV;
    vec2 trailUV4 = displacedUV;
    
    // Create additional trail layers for each historical position
    vec2 persistentTrailUV = displacedUV;
    
    // Calculate falloff factors for layered effects with larger area
    float falloff1 =
      pow(1.0 - clamp(distanceFromMouse / 0.8, 0.0, 1.0), 4.0);
    float falloff2 =
      pow(1.0 - clamp(distanceFromMouse / 0.75, 0.0, 1.0), 4.0);
    float falloff3 =
      pow(1.0 - clamp(distanceFromMouse / 0.7, 0.0, 1.0), 4.0);
    float falloff4 =
      pow(1.0 - clamp(distanceFromMouse / 0.65, 0.0, 1.0), 4.0);

    // Check all trail positions for persistent directional pixelation
    for (int i = 0; i < 60; i++) {
      if (uTrailStrengths[i] > 0.05) {
        vec2 trailPos = uTrailPositions[i];
        vec2 trailDir = uTrailDirections[i];
        vec2 toPixel = uv - trailPos;
        float trailDist = length(toPixel);
        
        // Check for directional trail extension
        float dirAlignment = dot(normalize(toPixel), -trailDir);
        
        // Create extended directional pixelation
        bool inDirectionalTrail = (dirAlignment > 0.2 && trailDist < 0.2);
        bool inCircularTrail = (trailDist < 0.1);
        
        if (inDirectionalTrail || inCircularTrail) {
          // Add a liquid-like dissolving effect to the tail
          float dissolveFactor = 1.0 - uTrailStrengths[i];
          float dissolveNoise =
            (sin(uv.x * 30.0 + uTime * 2.0 + uv.y * 20.0) * 0.5 +
             0.5) *
            dissolveFactor;

          // Create pixelation effect for this trail position
          float trailPixelSize = mix(
            12.0,
            22.0,
            uTrailStrengths[i]
          ); // Smaller = more blocky
          vec2 trailPixelCoord =
            floor(
              (displacedUV + dissolveNoise * 0.1) * trailPixelSize
            ) /
              trailPixelSize +
            0.5 / trailPixelSize;

          float trailBlend = 0.0;
          if (inDirectionalTrail) {
            // Stronger effect for directional trail
            trailBlend = smoothstep(0.2, 0.0, trailDist) * 
                       smoothstep(0.2, 0.7, dirAlignment) * 
                       uTrailStrengths[i] * 0.9;
          } else {
            // Regular circular effect
            trailBlend = smoothstep(0.1, 0.0, trailDist) * uTrailStrengths[i] * 0.7;
          }
          
          persistentTrailUV = mix(persistentTrailUV, trailPixelCoord, trailBlend);
        }
      }
    }
    
    // Always create trails when mouse is nearby or pixelation is active
    if (
      pixelationStrength > 0.05 ||
      exponentialFalloff > 0.01 ||
      maxTrailEffect > 0.1
    ) {
      // Create different sized pixel grids for trail layers - much more aggressive
      float trailSize1 = max(pixelSize * 0.15, 8.0); // Most blocky trail
      float trailSize2 = max(pixelSize * 0.3, 10.0); // Medium blocky
      float trailSize3 = max(pixelSize * 0.6, 14.0); // Less blocky
      float trailSize4 = max(pixelSize * 0.9, 18.0); // Finest trail
      
      // Create trail coordinates with time-based offsets for organic movement
      vec2 mouseDir = normalize(uMousePosition - vec2(0.5));
      float trailOffset = uTime * 1.5;
      
      vec2 offset1 = mouseDir * sin(trailOffset * 1.2) * 0.04 + vec2(cos(trailOffset * 0.8) * 0.03, sin(trailOffset * 1.1) * 0.03);
      vec2 offset2 = mouseDir * sin(trailOffset * 0.9) * 0.045 + vec2(sin(trailOffset * 1.3) * 0.035, cos(trailOffset * 0.7) * 0.035);
      vec2 offset3 = mouseDir * sin(trailOffset * 1.5) * 0.05 + vec2(cos(trailOffset * 1.0) * 0.04, sin(trailOffset * 1.4) * 0.04);
      vec2 offset4 = mouseDir * sin(trailOffset * 0.6) * 0.055 + vec2(sin(trailOffset * 0.9) * 0.045, cos(trailOffset * 1.2) * 0.045);
      
      // Calculate pixelated coordinates for each trail layer
      vec2 trailCoord1 = floor((persistentTrailUV + offset1) * trailSize1) / trailSize1 + 0.5 / trailSize1;
      vec2 trailCoord2 = floor((persistentTrailUV + offset2) * trailSize2) / trailSize2 + 0.5 / trailSize2;
      vec2 trailCoord3 = floor((persistentTrailUV + offset3) * trailSize3) / trailSize3 + 0.5 / trailSize3;
      vec2 trailCoord4 = floor((persistentTrailUV + offset4) * trailSize4) / trailSize4 + 0.5 / trailSize4;
      
      // Calculate individual trail strengths based on distance and time - much stronger
      float baseTrailStrength = max(pixelationStrength, max(maxTrailEffect, 0.3));
      float trail1Strength = falloff1 * baseTrailStrength * 1.0;
      float trail2Strength = falloff2 * baseTrailStrength * 0.8;
      float trail3Strength = falloff3 * baseTrailStrength * 0.6;
      float trail4Strength = falloff4 * baseTrailStrength * 0.4;
      
      // Apply trail pixelation with minimum strength
      trailUV1 = mix(persistentTrailUV, trailCoord1, max(trail1Strength, 0.25));
      trailUV2 = mix(persistentTrailUV, trailCoord2, max(trail2Strength, 0.2));
      trailUV3 = mix(persistentTrailUV, trailCoord3, max(trail3Strength, 0.15));
      trailUV4 = mix(persistentTrailUV, trailCoord4, max(trail4Strength, 0.1));
    }
    
    // Sample the video texture with main pixelated UV
    vec4 color = texture2D(uTexture, displacedUV);
    
    // Create layered trail effect when mouse is active or trails are present
    if (
      pixelationStrength > 0.02 ||
      exponentialFalloff > 0.01 ||
      maxTrailEffect > 0.05
    ) {
      vec4 trailColor1 = texture2D(uTexture, trailUV1);
      vec4 trailColor2 = texture2D(uTexture, trailUV2);
      vec4 trailColor3 = texture2D(uTexture, trailUV3);
      vec4 trailColor4 = texture2D(uTexture, trailUV4);
      
      // Calculate blend weights based on distance from mouse and trail effects
      float baseBlend = max(pixelationStrength, max(maxTrailEffect, 0.25));
      float blend1 = falloff1 * baseBlend * 0.7;
      float blend2 = falloff2 * baseBlend * 0.6;
      float blend3 = falloff3 * baseBlend * 0.5;
      float blend4 = falloff4 * baseBlend * 0.4;
      
      // Add trail-specific blending for persistent effect
      blend1 = max(blend1, maxTrailEffect * 0.6);
      blend2 = max(blend2, maxTrailEffect * 0.5);
      blend3 = max(blend3, maxTrailEffect * 0.4);
      blend4 = max(blend4, maxTrailEffect * 0.3);
      
      // Ensure minimum blending for visibility
      blend1 = max(blend1, 0.25);
      blend2 = max(blend2, 0.2);
      blend3 = max(blend3, 0.15);
      blend4 = max(blend4, 0.1);
      
      // Blend trail layers with varying intensities
      color = mix(color, trailColor1, blend1);
      color = mix(color, trailColor2, blend2);
      color = mix(color, trailColor3, blend3);
      color = mix(color, trailColor4, blend4);
    }
    
    // Chromatic aberration only during active movement to hide artifacts
    if (uMouseMoveStrength > 0.1) {
      float colorDisp = displacement * 0.25;  // Increased color separation
      
      // Add stronger variation to the color separation direction
      vec2 colorNoiseR = vec2(sin(uTime * 2.5 + uv.y * 35.0), cos(uTime * 2.8 + uv.x * 30.0)) * 0.35;  // Increased color noise
      vec2 colorNoiseB = vec2(cos(uTime * 2.2 + uv.x * 25.0), sin(uTime * 3.0 + uv.y * 40.0)) * 0.35;
      
      // Sample colors with enhanced organic offset using pixelated UV
      vec4 colorR = texture2D(uTexture, displacedUV + (direction + colorNoiseR) * colorDisp);
      vec4 colorB = texture2D(uTexture, displacedUV - (direction + colorNoiseB) * colorDisp);
      
      // Calculate smooth falloff for color mixing with stronger effect
      float distanceStrength = exp(-distanceFromMouse * 1.2);  // Adjusted falloff
      float chromaStrength = distanceStrength * uMouseMoveStrength * 1.5;  // Increased strength
      color.r = mix(color.r, colorR.r, chromaStrength);
      color.b = mix(color.b, colorB.b, chromaStrength);
    }
    
    // Enhanced contrast and saturation when heavily pixelated for trail visibility
    if (pixelationStrength > 0.15) {
      // Boost contrast and saturation for blocky trail effect
      color.rgb = mix(color.rgb, color.rgb * 1.15, pixelationStrength * 0.4);
      
      // Add slight color shift for trail distinctiveness
      color.rgb *= mix(vec3(1.0), vec3(1.05, 0.98, 1.02), pixelationStrength * 0.3);
    }
    
    gl_FragColor = color;
  }
`;