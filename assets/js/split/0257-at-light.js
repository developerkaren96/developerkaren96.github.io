/*
 * Light — high-level wrapper around `BaseLight` that ties a light
 * to: (1) an InputUIL config block so its parameters are editable
 * at runtime, (2) a parent group whose transform drives the light's
 * world position/rotation via the per-frame `loop()`, and (3) a
 * shared UPDATE event channel so multiple instances of the same
 * prefixed config stay in sync.
 *
 * Composition:
 *   - Inherits Object3D — this wrapper *is* a scene node. The
 *     underlying `BaseLight` (stored on `this.light`) is *not*
 *     parented into the scene; instead, `loop()` mirrors the
 *     wrapper's group position/rotation onto the light each frame.
 *     This lets multiple cooperating instances reference the same
 *     light parameters by prefix while each having its own transform.
 *
 * Config UI (`_folder`, `_config`):
 *   - `initNumber(key)` builds a UILControlNumber tied to
 *     `${prefix}${key}` (prefix = `L_${input.prefix}`). The control
 *     reads its initial value from UILStorage and falls back to the
 *     BaseLight's current value. On change, fires `Light.UPDATE`
 *     with `{prefix, key, val, group: self}`; on finish, persists
 *     via UILStorage.set.
 *   - Other helpers (initColor, initBool, etc.) follow the same
 *     pattern.
 *
 * Cross-instance sync via `update(e)`:
 *   - Listens for `Light.UPDATE`. If the event's prefix matches and
 *     the originator was a different `group`, applies the change
 *     locally — keeps every Light with the same prefix coherent
 *     without each one needing to subscribe directly. Color values
 *     are detected and applied with `.set(val)` instead of bare
 *     assignment.
 *
 * `Light.UPDATE` — static event name for the cross-instance sync.
 */
Class(
  function Light(_input, _group) {
    Inherit(this, Object3D);
    const self = this;
    var _config,
      _folder,
      _debug,
      prefix = `L_${_input.prefix}`,
      _light = (this.light = new BaseLight());
    function loop() {
      _light.position.copy(self.group.position);
      _light.rotation.copy(self.group.rotation);
    }
    function initNumber(key) {
      let initValue = UILStorage.get(`${prefix}${key}`) || _light[key];
      if (_folder) {
        let number = new UILControlNumber(`${prefix}${key}`, {
          label: key,
          value: initValue,
          step: 0.05,
        });
        number.onChange((e) => {
          _light[key] = e;
          self.events.fire(Light.UPDATE, {
            prefix: prefix,
            key: key,
            val: e,
            group: self,
          });
        });
        number.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
        _folder.add(number);
      }
      _light[key] = initValue;
    }
    function update(e) {
      e.prefix == prefix &&
        e.group != self &&
        (e.color ? _light[e.key].set(e.val) : (_light[e.key] = e.val));
    }
    !(function () {
      !(async function initConfig() {
        (_config = InputUIL.create(prefix + '_config', _group)).setLabel('Config');
        _config.addSelect('type', [
          {
            label: 'Null',
            value: '-1',
          },
          {
            label: 'Directional',
            value: '0',
          },
          {
            label: 'Point',
            value: '1',
          },
          {
            label: 'Spot',
            value: '2',
          },
          {
            label: 'Area',
            value: '3',
          },
        ]);
        await defer();
        let setup = (_) => {
          _light.properties.w = _config.getNumber('type') + 1;
          _group &&
            Utils.query('debugLight') &&
            (_debug && _debug.destroy(),
            (_debug = self.initClass(LightDebug, _config.getNumber('type'), _light, _folder)));
        };
        setup();
        (function initSpecificUIL(type) {
          switch (type) {
            case 0:
              break;
            case 2:
              _light.radius = 1;
              _light.feather = 0;
              _light.rotation.set(0, Math.radians(90), 0);
              initNumber('radius');
              initNumber('feather');
              _light.data.set(
                _light.rotation.z,
                _light.rotation.y,
                _light.rotation.x,
                _light.radius,
              );
              _light.data2.x = _light.feather;
              _group &&
                self.startRender((_) => {
                  _light.data2.x = _light.feather;
                  _light.data.set(
                    _light.rotation.z,
                    _light.rotation.y,
                    _light.rotation.x,
                    _light.radius,
                  );
                });
              break;
            case 3:
              _light._overridePos = new Vector3();
              _light.width = 1;
              _light.height = 1;
              _light.roughness = 0.5;
              _light.isAreaLight = true;
              initNumber('width');
              initNumber('height');
              initNumber('roughness');
              let pos = new Vector3(),
                matrix4 = new Matrix4(),
                matrix42 = new Matrix4(),
                halfWidth = new Vector3(),
                halfHeight = new Vector3(),
                camera = World.CAMERA,
                p = self.group._parent;
              for (; p; ) {
                p instanceof Scene && p.nuke && (camera = p.nuke.camera);
                p = p._parent;
              }
              let updateProperties = (_) => {
                _light.updateMatrixWorld(true);
                pos.setFromMatrixPosition(_light.matrixWorld);
                pos.applyMatrix4(camera.matrixWorldInverse);
                _light.data.x = pos.x;
                _light.data.y = pos.y;
                _light.data.z = pos.z;
                _light.data.w = _light.roughness;
                matrix42.identity();
                matrix4.copy(_light.matrixWorld);
                matrix4.premultiply(camera.matrixWorldInverse);
                matrix42.extractRotation(matrix4);
                halfWidth.set(0.5 * _light.width, 0, 0);
                halfHeight.set(0, 0.5 * _light.height, 0);
                halfWidth.applyMatrix4(matrix42);
                halfHeight.applyMatrix4(matrix42);
                _light.data2.x = halfWidth.x;
                _light.data2.y = halfWidth.y;
                _light.data2.z = halfWidth.z;
                _light.data3.x = halfHeight.x;
                _light.data3.y = halfHeight.y;
                _light.data3.z = halfHeight.z;
              };
              RenderManager.type == RenderManager.WEBVR
                ? self.startRender((e) => {
                    camera = e.camera;
                    updateProperties();
                  }, RenderManager.EYE_RENDER)
                : self.startRender(updateProperties);
          }
        })(_config.getNumber('type'));
        _config.onUpdate = setup;
      })();
      _group &&
        ((_folder = (function createFolder() {
          if (!UIL.sidebar) return null;
          let folder = new UILFolder(prefix, {
            label: 'Params',
            closed: true,
          });
          return (_group.add(folder), folder);
        })()),
        (function addListeners() {
          self.events.sub(Light.UPDATE, update);
        })());
      initNumber('intensity');
      initNumber('distance');
      initNumber('bounce');
      (function initColor(key) {
        let initValue = UILStorage.get(`${prefix}${key}`);
        if (_folder) {
          let color = new UILControlColor(`${prefix}${key}`, {
            label: key,
            value: initValue,
          });
          color.onChange((e) => {
            _light[key].set(e);
            self.events.fire(Light.UPDATE, {
              prefix: prefix,
              key: key,
              val: e,
              color: true,
              group: self,
            });
          });
          color.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
          _folder.add(color);
        }
        initValue && _light[key].set(initValue);
      })('color');
      let p = self.parent.group._parent;
      for (; p; ) {
        p instanceof Scene && p._lightingData && (_light._lightingData = p._lightingData);
        p = p._parent;
      }
      Lighting.add(_light);
      self.startRender(loop);
    })();
    this.onDestroy = function () {
      _light.destroy();
    };
    this.setColor = function (color) {
      _light.color.copy(color);
    };
  },
  (_) => {
    Light.UPDATE = 'light_update';
  },
);
