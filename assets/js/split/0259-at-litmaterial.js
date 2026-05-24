/*
 * LitMaterial — minimal material decorator. Given a (mesh, shader,
 * group, input) tuple from the scene-layout system, it flips the
 * shader's `receiveLight` and `receiveShadow` flags on (so the
 * lighting/shadow uniform injection pass picks it up) and binds a
 * default black albedo via `tMap`. Callers can then override
 * `tMap` at runtime; the black default keeps the shader compilable
 * before a real texture is assigned.
 */
Class(function LitMaterial(_mesh, _shader, _group, _input) {
  _shader.receiveLight = true;
  _shader.receiveShadow = true;
  _shader.addUniforms({
    tMap: {
      value: Utils3D.getTexture('assets/images/_scenelayout/black.jpg'),
    },
  });
});
