/*
 * VRInputHandAura — alternate hand model driven by the AURA
 * native-XR bridge (Active Theory's iOS/Android WebXR shim) on
 * devices that expose Oculus-style hand-joint payloads rather
 * than the WebXR `XRHand` API. Subclass of VRAbstractHand.
 *
 * Geometry: `vrhands/aura_<left|right>` skinned mesh, added
 * straight to `World.SCENE` (rather than to camera.wrapper —
 * AURA reports world-space root pose directly).
 *
 * Bone mapping: explicit Oculus `ovrHandBone_*` → skin index
 * table (19 entries: WristRoot, ForearmStub, Thumb0-3,
 * Index1-3, Middle1-3, Ring1-3, Pinky0-3). Note Index0 / Ring0
 * are absent in the source mapping — AURA only sends 19 bones.
 *
 * Fingertips:
 *   - 5 tips at *3 bones (Thumb3, Index3, Middle3, Ring3,
 *     Pinky3) with their *2 parents — distal joints since
 *     AURA's bone list ends one segment shy of `_tip`.
 *   - `_center` extra tip at Middle1 (palm centre) for the
 *     hand `body` proxy.
 *
 * `update(frame, data)` — copies the AURA `data` payload into
 * an internal `_data` cache (root position/orientation +
 * per-bone quaternions). `confidence > 3` gates `group.visible`
 * so flickery/low-confidence frames hide the mesh.
 *
 * Per-frame `loop` consumes `_data` (decoupled so the data can
 * be lerped over multiple frames):
 *   - For each mapped bone, slerps current quaternion toward
 *     the target by 0.5 (visual smoothing — avoids jitter when
 *     AURA reports at <render rate).
 *   - Lerps root bone position by 0.5, slerps root orientation
 *     by 1.0 (snap rotation — rotational drift is more
 *     perceptible than positional jitter).
 *
 * Reactive accessors mirror VRInputHand (thumb/index/middle/
 * ring/pinky 0-4) so the input layer can use either class
 * interchangeably.
 */
Class(function VRInputHandAura(_type) {
  Inherit(this, VRAbstractHand);
  const self = this;
  var _boneMapping, _mesh, _center;
  const _data = {
    rootPose: {
      position: [],
      orientation: [],
    },
  };
  var _quaternion = new Quaternion(),
    _vector = new Vector3();
  function loop() {
    if ('number' != typeof _data.hand) return;
    _boneMapping.forEach((entry) => {
      let orientation = _data[entry.name],
        bone = _mesh.bones[entry.skinIndex];
      _quaternion.fromArray(orientation);
      bone.quaternion.slerp(_quaternion, 0.5);
    });
    let position = _data.rootPose.position,
      orientation = _data.rootPose.orientation;
    _vector.fromArray(position);
    _quaternion.fromArray(orientation);
    _mesh.bones[0].position.lerp(_vector, 0.5);
    _mesh.bones[0].quaternion.slerp(_quaternion, 1);
  }
  this.hand = this.handedness = _type;
  this.tips = [];
  (async function () {
    await (async function initMesh() {
      _geom = await GeomThread.loadSkinnedGeometry('vrhands/aura_' + _type);
      self.flag('loaded', true);
      _mesh = new Skin(_geom, self.shader, _geom.bones);
      self.add(_mesh);
      _mesh.frustumCulled = false;
      World.SCENE.add(self.group);
    })();
    (function initBoneMapping() {
      _boneMapping = [
        {
          name: 'ovrHandBone_WristRoot',
          skinIndex: 0,
          skeletonIndex: 0,
        },
        {
          name: 'ovrHandBone_ForearmStub',
          skinIndex: 23,
          skeletonIndex: 1,
        },
        {
          name: 'ovrHandBone_Thumb0',
          skinIndex: 1,
          skeletonIndex: 2,
        },
        {
          name: 'ovrHandBone_Thumb1',
          skinIndex: 2,
          skeletonIndex: 3,
        },
        {
          name: 'ovrHandBone_Thumb2',
          skinIndex: 3,
          skeletonIndex: 4,
        },
        {
          name: 'ovrHandBone_Thumb3',
          skinIndex: 4,
          skeletonIndex: 5,
        },
        {
          name: 'ovrHandBone_Index1',
          skinIndex: 6,
          skeletonIndex: 6,
        },
        {
          name: 'ovrHandBone_Index2',
          skinIndex: 7,
          skeletonIndex: 7,
        },
        {
          name: 'ovrHandBone_Index3',
          skinIndex: 8,
          skeletonIndex: 8,
        },
        {
          name: 'ovrHandBone_Middle1',
          skinIndex: 10,
          skeletonIndex: 9,
        },
        {
          name: 'ovrHandBone_Middle2',
          skinIndex: 11,
          skeletonIndex: 10,
        },
        {
          name: 'ovrHandBone_Middle3',
          skinIndex: 12,
          skeletonIndex: 11,
        },
        {
          name: 'ovrHandBone_Ring1',
          skinIndex: 14,
          skeletonIndex: 12,
        },
        {
          name: 'ovrHandBone_Ring2',
          skinIndex: 15,
          skeletonIndex: 13,
        },
        {
          name: 'ovrHandBone_Ring3',
          skinIndex: 16,
          skeletonIndex: 14,
        },
        {
          name: 'ovrHandBone_Pinky0',
          skinIndex: 18,
          skeletonIndex: 15,
        },
        {
          name: 'ovrHandBone_Pinky1',
          skinIndex: 19,
          skeletonIndex: 16,
        },
        {
          name: 'ovrHandBone_Pinky2',
          skinIndex: 20,
          skeletonIndex: 17,
        },
        {
          name: 'ovrHandBone_Pinky3',
          skinIndex: 21,
          skeletonIndex: 18,
        },
      ];
    })();
    (function initFingerTips() {
      const getBone = (key) => {
        for (let i = 0; i < _boneMapping.length; i++) {
          let entry = _boneMapping[i];
          if (entry.name == key) return _mesh.bones[entry.skinIndex];
        }
      };
      [
        'ovrHandBone_Thumb3',
        'ovrHandBone_Index3',
        'ovrHandBone_Middle3',
        'ovrHandBone_Ring3',
        'ovrHandBone_Pinky3',
      ].forEach((key) => {
        self.tips.push(
          self.initClass(VRHandFingerTip, getBone(key), getBone(key.replace('3', '2'))),
        );
      });
      _center = self.initClass(
        VRHandFingerTip,
        getBone('ovrHandBone_Middle1'),
        getBone('ovrHandBone_Middle3'),
      );
    })();
    self.startRender(loop);
  })();
  this.update = function (frame, data) {
    _mesh &&
      ((_data.hand = data.hand),
      (_data.rootPose.position[0] = data.rootPose.position[0]),
      (_data.rootPose.position[1] = data.rootPose.position[1]),
      (_data.rootPose.position[2] = data.rootPose.position[2]),
      (_data.rootPose.orientation[0] = data.rootPose.orientation[0]),
      (_data.rootPose.orientation[1] = data.rootPose.orientation[1]),
      (_data.rootPose.orientation[2] = data.rootPose.orientation[2]),
      (_data.rootPose.orientation[3] = data.rootPose.orientation[3]),
      _boneMapping.forEach((entry) => {
        _data[entry.name] || (_data[entry.name] = []);
        _data[entry.name][0] = data[entry.name][0];
        _data[entry.name][1] = data[entry.name][1];
        _data[entry.name][2] = data[entry.name][2];
        _data[entry.name][3] = data[entry.name][3];
      }),
      (self.group.visible = data.confidence > 3),
      _center.update(),
      self.body.position.copy(_center.position),
      self.body.updateMatrixWorld(true));
  };
  this.ready = function () {
    return self.wait('loaded');
  };
  this.get('thumb', (_) => self.tips[0]);
  this.get('index', (_) => self.tips[1]);
  this.get('middle', (_) => self.tips[2]);
  this.get('ring', (_) => self.tips[3]);
  this.get('pinky', (_) => self.tips[4]);
});
