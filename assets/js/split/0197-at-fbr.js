/*
 * FBR — "Fake/Faux Based Rendering" decorator: a tiny material mixin
 * that grafts a PBR-flavoured uniform set onto an existing Shader.
 *
 * Adds the standard "matcap + MRO + normal" uniform bundle used by
 * Hydra's lighter-weight PBR substitute:
 *   - `tMatcap`        : matcap sphere texture (encodes ambient
 *                         lighting+specular into a 2D sample).
 *   - `tMRO`           : packed Metallic/Roughness/Occlusion map
 *                         (repeat-wrapped, hence the custom
 *                         `getTexture: Utils3D.getRepeatTexture`).
 *   - `tNormal`        : tangent-space normal map (also repeat).
 *   - `uNormalStrength`: scalar multiplier applied to the normal
 *                         displacement vector.
 *   - `uLight`         : vec4 RGB+intensity for the synthetic light.
 *   - `uColor`         : base tint colour applied on top.
 *
 * The constructor mutates the given shader in place — there's no
 * inheritance or wrapping. Callers attach FBR after building the
 * shader.
 *
 * Static side: `window.fbr = FBR` exposes the constructor globally
 * so user shaders can reference it directly.
 */
Class(
  function FBR(_shader) {
    _shader.addUniforms({
      tMatcap: { value: null },
      tMRO: { value: null, getTexture: Utils3D.getRepeatTexture },
      tNormal: { value: null, getTexture: Utils3D.getRepeatTexture },
      uNormalStrength: { value: 1 },
      uLight: { value: new Vector4(1, 1, 1, 1) },
      uColor: { value: new Color() },
    });
  },
  () => {
    window.fbr = FBR;
  },
);
