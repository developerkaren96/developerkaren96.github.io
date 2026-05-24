/*
 * ShaderCode Module — cross-version GLSL transforms.
 *
 * Hydra authors shaders in a GLSL3-ish dialect (uniform blocks, `in/out`,
 * native `texture(...)` etc.) and lets this module rewrite them down to
 * whatever the running context actually supports.
 *
 * Two entry points:
 *
 *   convertWebGL1(code, type)
 *     - Strips the `#version 300 es` line and the GL3 fragment output
 *       declaration (`out vec4 FragColor;` — WebGL1 uses gl_FragColor).
 *     - Maps `samplerExternalOES` → `sampler2D` (no OES_EGL_image_external
 *       on WebGL1 here).
 *     - Rewrites `texture(...)` / `texture2D(...)` / `textureCube(...)`
 *       and their *Lod / *Grad / *ProjLod / *ProjGrad variants:
 *         * Resolves the implicit sampler kind by scanning the call site
 *           for the matching `uniform sampler{2D,Cube,…} <name>`.
 *         * Drops a trailing `EXT` (some authoring tools add it).
 *         * If the GL1 context has EXT_shader_texture_lod, keeps the
 *           `Lod`/`Grad`/`ProjLod`/`ProjGrad` suffix with an `EXT`
 *           tail (textureCubeLodEXT, etc.); otherwise downgrades Lod →
 *           no-suffix (which loses the lod argument but won't error).
 *         * Vertex stage always keeps `Lod`/`ProjLod` (textureLod is
 *           callable in vertex shaders even on WebGL1).
 *     - Flattens any std140 `uniform {global,ubo,lights} { … }` block
 *       back into individual `uniform <type> <name>;` declarations
 *       (UBOs only exist on WebGL2).
 *
 *   convertWebGL2(code, type)
 *     - Vertex: `attribute` → `in`, `varying` → `out`.
 *       Fragment:                 `varying` → `in`.
 *     - Drops the `EXT` suffix from `texture*EXT(` calls and unifies on
 *       `texture(...)` (GL3 has one polymorphic sampler call).
 *     - `samplerExternalOES` is left alone if the platform is Android
 *       inside the AURA host (which provides external textures); on
 *       other platforms it's downgraded to `sampler2D`.
 *     - `Renderer.UBO` true (WebGL2 + UBO supported): each `uniform
 *       <block> {` gets a `layout(std140)` prefix so the offsets pack
 *       correctly. Special-case: if `Lighting.UBO` is false, the
 *       `lights` block is flattened the same way as on WebGL1.
 *     - `Renderer.UBO` false: every block is flattened.
 *
 * Helper:
 *   removeUBO(code, name)
 *     Walks the lines between `uniform <name> { ` and `};`, prefixes each
 *     with `uniform `, then strips the wrapping braces. The result is a
 *     flat list of declarations equivalent to the original block.
 */
Module(function ShaderCode() {
  // Match any `texture` or `texture2D`/`textureCube` (with optional suffix
  // like Lod, Grad, ProjLod, ProjGrad, possibly trailing EXT) followed by `(`.
  const textureExpression = /texture(2D|Cube)?(\w+)?\s*\(/g;

  /*
   * Convert a std140 UBO declaration into a flat list of `uniform <type>
   * <name>;` lines so it works on backends without UBO support.
   */
  function removeUBO(code, name) {
    let uniforms = code.split(`uniform ${name} {`)[1];
    uniforms = uniforms.split('};')[0];
    uniforms = uniforms.split('\n');
    uniforms.forEach((u) => {
      u = u.trim();
      if (u.length) code = code.replace(u, 'uniform ' + u);
    });
    // Drop the now-empty `{ } ;` wrapper.
    let split = code.split(`uniform ${name} {`);
    split[1] = split[1].replace('};', '');
    code = split.join('');
    code = code.replace(`uniform ${name} {`, '');
    return code;
  }

  this.exports = {
    /*
     * GLSL3 → GLSL1 / WebGL1 rewrite. `type` is 'vs' or 'fs'.
     */
    convertWebGL1(code, type) {
      code = code.replace('#version 300 es', '');
      code = code.replace('out vec4 FragColor;', '');

      if (code.includes('samplerExternalOES')) {
        code = code.replace('samplerExternalOES', 'sampler2D');
      }

      // Rewrite texture lookups.
      code = code.replace(
        textureExpression,
        function (match, samplerType, suffix = '', offset, origCode) {
          // If `texture(` was used without an explicit sampler kind in
          // the function name, resolve by looking up the named sampler.
          if (!samplerType) {
            const name = origCode
              .substring(offset + match.length)
              .split(',', 1)[0]
              ?.trim();
            if (name) {
              samplerType = new RegExp(`sampler(\\w+)\\s+${name}`).exec(origCode)?.[1];
            }
            if (!samplerType) samplerType = '2D';
          }

          // Drop trailing EXT.
          if (suffix.endsWith('EXT')) suffix = suffix.slice(0, -3);

          // textureLod / textureProjLod are valid in vertex stage even on WebGL1.
          if (type === 'vs' && ['Lod', 'ProjLod'].includes(suffix)) {
            return `texture${samplerType}${suffix}(`;
          }

          // Fragment Lod/Grad variants: prefer the EXT form if available,
          // otherwise downgrade Lod → no-suffix.
          if (['Lod', 'Grad', 'ProjLod', 'ProjGrad'].includes(suffix)) {
            if (Renderer.extensions.lod) return `texture${samplerType}${suffix}EXT(`;
            if (suffix.endsWith('Lod')) suffix = suffix.slice(0, -3);
          }

          return `texture${samplerType}${suffix}(`;
        },
      );

      // No UBOs on WebGL1 — flatten every block.
      if (code.includes('uniform global {')) code = removeUBO(code, 'global');
      if (code.includes('uniform ubo {'))    code = removeUBO(code, 'ubo');
      if (code.includes('uniform lights {')) code = removeUBO(code, 'lights');
      return code;
    },

    /*
     * GLSL3-ish → WebGL2 GLSL3. `type` is 'vs' or 'fs'.
     */
    convertWebGL2(code, type) {
      if (type === 'vs') {
        code = code.replace(/attribute/g, 'in');
        code = code.replace(/varying/g, 'out');
      } else {
        code = code.replace(/varying/g, 'in');
      }

      // Drop the EXT suffix from texture lookups (one polymorphic `texture(...)` on GL3).
      code = code.replace(textureExpression, function (match, samplerType, suffix = '') {
        if (suffix.endsWith('EXT')) suffix = suffix.slice(0, -3);
        return `texture${suffix}(`;
      });

      // Only the AURA Android shell exposes samplerExternalOES on WebGL2;
      // everywhere else, downgrade.
      if (
        code.includes('samplerExternalOES') &&
        !('android' === Device.system.os && window.AURA)
      ) {
        code = code.replace('samplerExternalOES', 'sampler2D');
      }

      if (Renderer.UBO) {
        // std140 layout markers so offsets pack correctly.
        if (code.includes('uniform global {')) code = code.replace('uniform global', 'layout(std140) uniform global');
        if (code.includes('uniform ubo {'))    code = code.replace('uniform ubo',    'layout(std140) uniform ubo');
        // `lights` only gets UBO treatment if the lighting subsystem opted in.
        if (Lighting.UBO) {
          if (code.includes('uniform lights {')) code = code.replace('uniform lights', 'layout(std140) uniform lights');
        } else if (code.includes('uniform lights {')) {
          code = removeUBO(code, 'lights');
        }
      } else {
        // UBOs disabled at runtime — flatten every block.
        if (code.includes('uniform global {')) code = removeUBO(code, 'global');
        if (code.includes('uniform ubo {'))    code = removeUBO(code, 'ubo');
        if (code.includes('uniform lights {')) code = removeUBO(code, 'lights');
      }

      return code;
    },
  };
});
