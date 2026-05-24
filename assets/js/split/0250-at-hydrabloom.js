/*
 * HydraBloom — multi-pass MIP-chain bloom pass for the Nuke
 * postprocessing pipeline. Implements the classic "progressive
 * downsample with luma threshold → progressive upsample with add"
 * recipe (PBR Bloom / COD-style dual filter):
 *
 *   pass 0: luma extract from input → mip[0]
 *   pass 1..N: downsample mip[i-1] → mip[i] (N = `nMips`, default 6)
 *   pass N..1: upsample + add mip[i] onto mip[i-1]
 *   final: blit composited bloom over the scene (additive via Nuke)
 *
 * Constructor args (with the overloading dance up top):
 *   - `_nuke`      — Nuke instance to register the pass with;
 *     defaults to `World.NUKE`. The first few lines reinterpret args
 *     if a string was passed in the first or second slot (legacy
 *     call signatures where `(unique)` or `(unique, options)` were
 *     accepted without an explicit Nuke ref).
 *   - options:
 *       - `nMips`     — depth of the mip chain (default 6).
 *       - `enabled`   — start enabled (default true).
 *       - `useMask`   — gate the luma extract by a mask texture
 *         (consumers like selective bloom set this).
 *       - `useHdr`    — use `HALF_FLOAT` RTs; otherwise RGBAFormat.
 *         Required for proper highlight intensities > 1.0.
 *       - `useRTPool` — pull RTs from a shared pool instead of
 *         allocating fresh; reduces VRAM when several Bloom
 *         instances are alive (e.g. selective + scene bloom).
 *   - `_unique`    — disambiguator suffix for shader / RT names so
 *     multiple Bloom instances don't collide in the resource cache.
 *
 * `_DPR = 0.5 * _nuke.dpr` — bloom always runs at half the Nuke
 * pipeline's device-pixel ratio. Bloom is low-frequency by nature
 * so the resolution cut is invisible while saving substantial fill.
 *
 * The four programs (`_blitProgram`, `_lumaProgram`,
 * `_downSampleProgram`, `_upSampleProgram`) are created lazily once
 * the input texture / brightness texture are wired and the chain is
 * allocated. `blitResolution` is the resolution of the final blit
 * back to the Nuke output.
 */
Class(function HydraBloom(
  _nuke,
  { nMips = 6, enabled = true, useMask = false, useHdr = true, useRTPool = false } = {},
  _unique,
) {
  Inherit(this, Component);
  const self = this;
  'string' == typeof options
    ? ((_unique = _params), (_nuke = World.NUKE))
    : 'string' == typeof _nuke
      ? ((_unique = _nuke), (_nuke = World.NUKE))
      : !_nuke || _nuke instanceof Nuke
        ? ((_nuke = _nuke || World.NUKE), (_unique = _unique || ''))
        : (_nuke = World.NUKE);
  let _DPR = 0.5 * _nuke.dpr;
  const PASS_COUNT = nMips,
    FORMAT = false !== useHdr ? Texture.HALF_FLOAT : Texture.RGBAFormat;
  let _blitProgram,
    _lumaProgram,
    _downSampleProgram,
    _upSampleProgram,
    _inputTexture,
    _brightnessTexture,
    textureParams = {
      minFilter: Texture.LINEAR,
      magFilter: Texture.LINEAR,
      format: FORMAT,
      generateMipmaps: false,
    };
  self.blitResolution = new Vector2(
    Math.round(_nuke.stage.width * _DPR),
    Math.round(_nuke.stage.height * _DPR),
  );
  let _downSamplePasses = [],
    _upSamplePasses = [];
  self.enabled = enabled || true;
  let _inputUIL = null;
  function createRT(width, height, opts) {
    return new RenderTarget(width, height, opts);
  }
  function loop() {
    if (!self.enabled || false === self.visible) return;
    let inputTarget = _inputTexture || _nuke.rttBuffer.texture;
    _lumaProgram.shader.uniforms.luminosityThreshold.value > 0.001 && !useMask
      ? (_lumaProgram.shader.set('tDiffuse', inputTarget),
        World.RENDERER.renderSingle(_lumaProgram, World.CAMERA, _downSamplePasses[0].buffer),
        (inputTarget = _brightnessTexture.texture))
      : (_blitProgram.shader.set('tMap', inputTarget),
        World.RENDERER.renderSingle(_blitProgram, World.CAMERA, _downSamplePasses[0].buffer));
    for (let i = 0; i < PASS_COUNT - 1; i++) {
      _downSampleProgram.shader.set('uResolution', _downSamplePasses[i].resolution);
      _downSampleProgram.shader.set('tMap', _downSamplePasses[i].buffer.texture);
      World.RENDERER.renderSingle(
        _downSampleProgram,
        World.CAMERA,
        _downSamplePasses[i + 1].buffer,
      );
    }
    const count = PASS_COUNT - 2;
    for (let i = count; i >= 0; i--) {
      _upSampleProgram.shader.set('uResolution', _upSamplePasses[i + 1].resolution);
      _upSampleProgram.shader.set(
        'tMap',
        i === count
          ? _downSamplePasses[i + 1].buffer.texture
          : _upSamplePasses[i + 1].buffer.texture,
      );
      _upSampleProgram.shader.set('tNext', _downSamplePasses[i].buffer.texture);
      World.RENDERER.renderSingle(_upSampleProgram, World.CAMERA, _upSamplePasses[i].buffer);
    }
  }
  function handleResize() {
    self.blitResolution = new Vector2(
      Math.round(_nuke.stage.width * _DPR),
      Math.round(_nuke.stage.height * _DPR),
    );
    let resX = self.blitResolution.x,
      resY = self.blitResolution.y;
    for (let i = 0; i < PASS_COUNT; i++) {
      _downSamplePasses[i].buffer.setSize(resX, resY);
      _upSamplePasses[i].buffer.setSize(resX, resY);
      resX = Math.round(0.5 * resX);
      resY = Math.round(0.5 * resY);
    }
  }
  !(function initPasses() {
    _brightnessTexture = createRT(_nuke.stage.width, _nuke.stage.height, textureParams);
    let resX = self.blitResolution.x,
      resY = self.blitResolution.y;
    for (let i = 0; i < PASS_COUNT; i++) {
      _downSamplePasses.push({
        buffer: createRT(resX, resY, textureParams),
        resolution: new Vector2(resX, resY),
      });
      _upSamplePasses.push({
        buffer: createRT(resX, resY, textureParams),
        resolution: new Vector2(resX, resY),
      });
      resX = Math.round(0.5 * resX);
      resY = Math.round(0.5 * resY);
    }
  })();
  (function initPrograms() {
    const geo = World.QUAD,
      blitShader = self.initClass(Shader, 'Blit', {
        tMap: {
          value: null,
        },
        depthTest: false,
        depthWrite: false,
      });
    if (((_blitProgram = new Mesh(geo, blitShader)), !useMask)) {
      const luminosityShader = self.initClass(Shader, 'BloomLuminosityPass', {
        tDiffuse: {
          value: null,
          ignoreUIL: true,
        },
        luminosityThreshold: {
          value: 0,
        },
        smoothWidth: {
          value: 0.01,
          ignoreUIL: true,
        },
        defaultColor: {
          value: new Color(0),
          ignoreUIL: true,
        },
        defaultOpacity: {
          value: 0,
          ignoreUIL: true,
        },
        unique: _unique,
      });
      ShaderUIL.add(luminosityShader).setLabel('Hydra Bloom Luminosity Params');
      _lumaProgram = new Mesh(geo, luminosityShader);
    }
    const downSampleShader = self.initClass(Shader, 'DownSample', {
      tMap: {
        value: null,
      },
      uResolution: {
        value: new Vector2(2, 2),
      },
      uSeed: {
        value: 0,
      },
      uRadius: {
        value: 1,
      },
      depthTest: false,
      depthWrite: false,
      unique: _unique,
    });
    _downSampleProgram = new Mesh(geo, downSampleShader);
    const upSampleShader = self.initClass(Shader, 'UpSample', {
      tMap: {
        value: null,
      },
      tNext: {
        value: null,
      },
      uResolution: {
        value: new Vector2(2, 2),
      },
      uSeed: {
        value: 0,
      },
      uRadius: {
        value: 1,
      },
      uIntensity: {
        value: 1,
      },
      uTint: {
        value: new Color(),
      },
      depthTest: false,
      depthWrite: false,
      unique: _unique,
    });
    _upSampleProgram = new Mesh(geo, upSampleShader);
  })();
  (function initPass() {
    self.pass = self.initClass(NukePass, 'HydraBloomPass', {
      tHydraBloom: {
        value: _upSamplePasses[0].buffer.texture,
      },
    });
  })();
  (function initInputUIL() {
    _inputUIL = InputUIL.create(`HydraBloom${_unique || ''}`);
    _inputUIL.setLabel(`Hydra Bloom ${_unique || ''}`);
    _inputUIL.addNumber('Bloom_Radius', 1, 0.1);
    _inputUIL.addNumber('Bloom_Intensity', 1, 0.1);
    _inputUIL.addColor('Bloom_Tint', new Color());
    _inputUIL.onUpdate = (key, value) => {
      _upSampleProgram.shader.set('uRadius', _inputUIL.getNumber('Bloom_Radius'));
      _upSampleProgram.shader.set('uIntensity', _inputUIL.getNumber('Bloom_Intensity'));
      _upSampleProgram.shader.set('uTint', new Color(_inputUIL.get('Bloom_Tint')));
      console.log(value);
    };
  })();
  (function addHandlers() {
    self.onResize(handleResize);
  })();
  self.startRender(loop);
  this.set('texture', (texture) => {
    _inputTexture = texture;
  });
  this.get('output', (_) => _upSamplePasses[0].buffer.texture);
  this.onInvisible = function () {};
  this.onVisible = function () {};
  self.onDestroy = function () {
    _downSamplePasses.forEach((pass) => pass.buffer.destroy());
    _upSamplePasses.forEach((pass) => pass.buffer.destroy());
    _downSamplePasses = [];
    _upSamplePasses = [];
  };
});
