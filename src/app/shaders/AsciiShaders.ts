export const vertexShader = `
varying vec2 vUv;
uniform float uTime;
uniform float mouse;

void main() {
    vUv = uv;
    float time = uTime * 5.;
    vec3 transformed = position;

    transformed.x += sin(time + position.y) * .5;
    transformed.y += cos(time + position.z) * .15;
    transformed.z += sin(time + position.x);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

export const fragmentShader = `
varying vec2 vUv;
uniform float mouse;
uniform float uTime;
uniform sampler2D uTexture;

void main() {
    float time = uTime;
    vec2 pos = vUv;
    
    float move = sin(time + mouse) * 0.01;
    float r = texture2D(uTexture, pos + cos(time * 2. - time + pos.x) * .01).r;
    float g = texture2D(uTexture, pos + tan(time * .5 + pos.x - time) * .01).g;
    float b = texture2D(uTexture, pos - cos(time * 2. + time + pos.y) * .01).b;
    float a = texture2D(uTexture, pos).a;
    gl_FragColor = vec4(r, g, b, a);
}
`; 