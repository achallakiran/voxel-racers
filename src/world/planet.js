// Tiny-planet warp. Physics, AI, collisions and the track all stay on a FLAT map (x, height, z). For display only,
// every vertex is bent onto a sphere with the Mercator mapping (conformal: it never shears or squashes a truck):
//   lam = x / R,  phi = -atan(sinh(z / R)),  P = (R + y) * (cos phi sin lam, sin phi, cos phi cos lam)
// (+z on the flat map runs SOUTH on the ball: that keeps the mapping right-handed, so triangles keep their winding and
// are not culled as back faces)
// Lengths are scaled by cos(phi) equally in every direction, so a road keeps its shape and width; keep the track inside
// about +-25 degrees of latitude (z within about +-35 for R = 80) and that scale stays above 0.9.
// The ground, barriers, props, trucks and particles all go through this one function, so a wheel that touches the
// flat ground touches the sphere by construction (a truck can't hover). The same function runs in the vertex shader
// (GLSL below) and on the CPU (camera, tests), and they are kept identical.

export const PLANET_U = { value: 0 };   // sphere radius, 0 = warp off (every other stage)

export function planetPoint(R, x, y, z, out = [0, 0, 0]) {
  const t = z / R;
  const cph = 1 / Math.cosh(t);
  const sph = -Math.tanh(t);
  const lam = x / R;
  const r = R + y;
  out[0] = r * cph * Math.sin(lam);
  out[1] = r * sph;
  out[2] = r * cph * Math.cos(lam);
  return out;
}

// the three flat-map axes as they lie on the sphere at this point: east (+x), north (+z), up (+y); east/north are
// scaled by cos(phi), the local length scale of the map
export function planetFrame(R, x, y, z) {
  const t = z / R;
  const cph = 1 / Math.cosh(t);
  const sph = -Math.tanh(t);
  const lam = x / R;
  const sl = Math.sin(lam); const cl = Math.cos(lam);
  const k = ((R + y) / R) * cph;
  return {
    east: [k * cl, 0, -k * sl],
    north: [k * sph * sl, -k * cph, k * sph * cl],
    up: [cph * sl, sph, cph * cl],
    scale: cph, lam, phi: -Math.atan(Math.sinh(t)),
  };
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// where a flat-map direction (dx, dy, dz) points on the sphere at (x, y, z)
export function planetDir(R, x, y, z, d) {
  const f = planetFrame(R, x, y, z);
  const e = norm(f.east); const n = norm(f.north); const u = f.up;
  return [e[0] * d[0] + u[0] * d[1] + n[0] * d[2], e[1] * d[0] + u[1] * d[1] + n[1] * d[2], e[2] * d[0] + u[2] * d[1] + n[2] * d[2]];
}

export const PLANET_GLSL = /* glsl */`
uniform float uPlanetR;
vec3 planetP(vec3 w) {
  float R = uPlanetR;
  float t = w.z / R;
  float cph = 1.0 / cosh(t);
  float sph = -tanh(t);
  float lam = w.x / R;
  float r = R + w.y;
  return r * vec3(cph * sin(lam), sph, cph * cos(lam));
}
vec3 planetN(vec3 w, vec3 n) {
  float R = uPlanetR;
  float t = w.z / R;
  float cph = 1.0 / cosh(t);
  float sph = -tanh(t);
  float lam = w.x / R;
  float sl = sin(lam); float cl = cos(lam);
  vec3 east = vec3(cl, 0.0, -sl);
  vec3 north = vec3(sph * sl, -cph, sph * cl);
  vec3 up = vec3(cph * sl, sph, cph * cl);
  return east * n.x + up * n.y + north * n.z;
}
`;

const PROJECT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
if (uPlanetR > 0.0) {
  vec3 pw = (modelMatrix * mvPosition).xyz;
  mvPosition = viewMatrix * vec4(planetP(pw), 1.0);
} else {
  mvPosition = modelViewMatrix * mvPosition;
}
gl_Position = projectionMatrix * mvPosition;
`;

const NORMAL = /* glsl */`
vec3 transformedNormal = objectNormal;
#ifdef USE_INSTANCING
  mat3 im = mat3( instanceMatrix );
  transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
  transformedNormal = im * transformedNormal;
#endif
if (uPlanetR > 0.0) {
  vec4 pl = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    pl = instanceMatrix * pl;
  #endif
  vec3 pw = (modelMatrix * pl).xyz;
  transformedNormal = planetN( pw, normalize( mat3( modelMatrix ) * transformedNormal ) );
  transformedNormal = normalize( mat3( viewMatrix ) * transformedNormal );
} else {
  transformedNormal = normalMatrix * transformedNormal;
}
#ifdef FLIP_SIDED
  transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
  vec3 transformedTangent = ( modelViewMatrix * vec4( objectTangent, 0.0 ) ).xyz;
  #ifdef FLIP_SIDED
    transformedTangent = - transformedTangent;
  #endif
#endif
`;

// Installs the warp on every standard material (Lambert/Basic/Points...) through the one hook three.js calls before
// compiling a shader. Materials flagged userData.noWarp (sky, stars, Earth, sun) are left alone, and ShaderMaterials
// are skipped. With PLANET_U.value = 0 the extra code is a no-op branch, so other stages look exactly as before.
export function installPlanetWarp(THREE) {
  if (THREE.Material.prototype.__planetWarp) return;
  THREE.Material.prototype.__planetWarp = true;
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (this.userData.noWarp || this.isShaderMaterial || this.isRawShaderMaterial) return;
    shader.uniforms.uPlanetR = PLANET_U;
    let v = shader.vertexShader;
    v = v.replace('#include <common>', '#include <common>\n' + PLANET_GLSL);
    v = v.replace('#include <project_vertex>', PROJECT);
    if (v.includes('#include <defaultnormal_vertex>')) v = v.replace('#include <defaultnormal_vertex>', NORMAL);
    shader.vertexShader = v;
  };
  THREE.Material.prototype.customProgramCacheKey = function () { return this.userData.noWarp ? 'plain' : 'planet'; };
  // objects are culled against their FLAT bounds, which is wrong once bent onto a sphere: draw everything on a planet
  const fi = THREE.Frustum.prototype.intersectsObject;
  THREE.Frustum.prototype.intersectsObject = function (o) { return PLANET_U.value > 0 ? true : fi.call(this, o); };
  const fs = THREE.Frustum.prototype.intersectsSprite;
  THREE.Frustum.prototype.intersectsSprite = function (o) { return PLANET_U.value > 0 ? true : fs.call(this, o); };
}
