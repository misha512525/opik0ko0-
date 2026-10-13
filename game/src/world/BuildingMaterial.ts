import * as THREE from 'three';

/**
 * Материал зданий: окна рисуются в шейдере по мировым координатам, поэтому
 * все дома — один InstancedMesh с кубом, без текстур. Ночью часть окон
 * светится (uNight), картинка окон зависит от per-instance seed (aSeed).
 */
export const buildingUniforms = {
  uNight: { value: 0 },
};

const COMMON = /* glsl */ `
uniform float uNight;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vWNormal;
float bHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export function patchBuildingMaterial<T extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = buildingUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aSeed;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSeed = aSeed;
vec4 bwp = vec4(transformed, 1.0);
vec3 bwn = normal;
#ifdef USE_INSTANCING
bwp = instanceMatrix * bwp;
bwn = mat3(instanceMatrix) * bwn;
#endif
bwp = modelMatrix * bwp;
vWPos = bwp.xyz;
vWNormal = normalize(mat3(modelMatrix) * bwn);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float bWin = 0.0; float bLit = 0.0; float bR = 0.0;
vec3 bn = normalize(vWNormal);
if (abs(bn.y) < 0.5) {
  float u = abs(bn.x) > 0.5 ? vWPos.z : vWPos.x;
  float sx = 2.4 + fract(vSeed * 7.13) * 1.8;
  float fh = 3.4;
  vec2 cell = vec2(floor(u / sx), floor((vWPos.y - 0.15) / fh));
  vec2 f = vec2(fract(u / sx), fract((vWPos.y - 0.15) / fh));
  float wx = 0.12 + fract(vSeed * 11.3) * 0.2;
  float ground = 1.0 - step(fh, vWPos.y);
  float inX = step(wx, f.x) * step(f.x, 1.0 - wx);
  float inY = mix(step(0.3, f.y) * step(f.y, 0.85), step(0.12, f.y) * step(f.y, 0.78), ground);
  bWin = inX * inY;
  bR = bHash(cell + vec2(vSeed * 113.0, bn.x * 7.0 + bn.z * 13.0));
  bLit = step(mix(0.52, 0.25, ground), bR) * bWin;
  vec3 glass = mix(vec3(0.16, 0.2, 0.26), vec3(0.32, 0.4, 0.5), fract(vSeed * 5.1));
  glass *= mix(1.0, 0.35, uNight);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, bWin);
  float ledge = step(f.y, 0.05);
  diffuseColor.rgb *= 1.0 - ledge * 0.22 * (1.0 - bWin);
} else {
  diffuseColor.rgb *= 0.55;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 bWarm = mix(vec3(1.0, 0.76, 0.42), vec3(0.7, 0.85, 1.0), step(0.82, fract(bR * 7.0)));
totalEmissiveRadiance += bWarm * bLit * uNight * 0.85;`,
      );
    if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.2, bWin);`,
      );
    }
  };
  mat.customProgramCacheKey = () => 'building-' + mat.type;
  return mat;
}
