export function applySemanticSurface(material, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uTurbulence: { value: 0 },
    uMouse: { value: [0, 0, 0] }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPulse = uniforms.uPulse;
    shader.uniforms.uTurbulence = uniforms.uTurbulence;
    shader.uniforms.uMouse = uniforms.uMouse;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uPulse;
uniform float uTurbulence;
uniform vec3 uMouse;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  float y0 = mix(x00, x10, f.y);
  float y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}
`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vec3 instanceOffset = vec3(0.0);
#ifdef USE_INSTANCING
  instanceOffset = instanceMatrix[3].xyz;
#endif

float swirl = valueNoise(position * 0.14 + instanceOffset * 0.03 + vec3(uTime * 0.12, uTime * 0.08, uTime * 0.05));
float fracture = valueNoise(position * 0.38 - vec3(uTime * 0.2));
float pulse = uPulse * 0.72 + uTurbulence * 0.4;
float offset = (swirl * 1.6 + fracture * 0.9) * pulse;
transformed += normal * offset;
transformed += normalize(position + 0.001) * (fracture - 0.5) * 0.32;
`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uPulse;
uniform float uTurbulence;
uniform vec3 uMouse;
`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `vec4 diffuseColor = vec4( diffuse, opacity );
float tone = 0.5 + 0.5 * sin(uTime * 0.5 + vViewPosition.x * 0.03 + vViewPosition.y * 0.01);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82, tone * 0.6);
diffuseColor.rgb += vec3(uPulse * 0.05 + uTurbulence * 0.03);
`
    );

    material.userData.semanticShader = shader;
  };

  material.userData.semanticUniforms = uniforms;
  return material;
}

export function updateSemanticSurface(material, time, pulse, turbulence, mouse) {
  const uniforms = material.userData.semanticUniforms;
  if (!uniforms) return;

  uniforms.uTime.value = time;
  uniforms.uPulse.value = pulse;
  uniforms.uTurbulence.value = turbulence;
  uniforms.uMouse.value = mouse.toArray();
}