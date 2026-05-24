/*
 * VRInputHand — real WebXR hand-tracking hand. Subclass of
 * VRAbstractHand (0376). Loaded only when the XRSession reports
 * an `inputSource.hand` (Quest/PSVR2/etc hand tracking).
 *
 * Geometry: `vrhands/hand_<left|right>` loaded as skinned via
 * GeomThread; built as a Skin with its skeleton's bones,
 * pre-rotated 90° around X and scaled 0.01 (joints come in
 * centimetres). Attached under `RenderManager.camera.wrapper`
 * so it tracks the headset's reference frame.
 *
 * XR joint list (25): wrist + 5 metacarpal/phalanx chains
 * (thumb has 4 joints, others 5 each), ending in `<finger>-tip`.
 * Mapped to the skin's named bones via the `b_%_*` pattern
 * (`%` = `l`|`r`). Each `_null` bone becomes a fingertip and
 * gets a VRHandFingerTip (5 tips: thumb, index, middle, ring,
 * pinky). The `middle1` bone is also captured as `_center` so
 * the hand `body` proxy sits at the palm centre rather than
 * the wrist.
 *
 * Per-frame `update(frame, hand, ref)` driven from VRInput:
 *   - For each XR joint name, `hand.get(jointSpace)` →
 *     `frame.getJointPose(space, ref)` → write the position
 *     (×100 to map metres→centimetres for the skin) and the
 *     orientation into the bone.
 *   - Updates the `_center` tip and stamps the body sphere's
 *     matrix/matrixWorld translation columns directly.
 *   - Calls `self.group.updateMatrixWorld(true)` once for the
 *     whole hand transform.
 *
 * Static event constant: `VRInputHand.PINCH` — fired by the
 * pinch detector inherited from VRAbstractHand.
 *
 * Reactive getters expose tips by finger name: thumb, index,
 * middle, ring, pinky (index 0-4).
 */
Class(
  function VRInputHand(_type) {
    Inherit(this, VRAbstractHand);
    const self = this;
    var _geom, _mesh, _center;
    this.hand = this.handedness = _type;
    this.tips = [];
    var _bones = [];
    const joints = [
      'wrist',
      'thumb-metacarpal',
      'thumb-phalanx-proximal',
      'thumb-phalanx-distal',
      'thumb-tip',
      'index-finger-metacarpal',
      'index-finger-phalanx-proximal',
      'index-finger-phalanx-intermediate',
      'index-finger-phalanx-distal',
      'index-finger-tip',
      'middle-finger-metacarpal',
      'middle-finger-phalanx-proximal',
      'middle-finger-phalanx-intermediate',
      'middle-finger-phalanx-distal',
      'middle-finger-tip',
      'ring-finger-metacarpal',
      'ring-finger-phalanx-proximal',
      'ring-finger-phalanx-intermediate',
      'ring-finger-phalanx-distal',
      'ring-finger-tip',
      'pinky-finger-metacarpal',
      'pinky-finger-phalanx-proximal',
      'pinky-finger-phalanx-intermediate',
      'pinky-finger-phalanx-distal',
      'pinky-finger-tip',
    ];
    !(async function () {
      await (async function initMesh() {
        _geom = await GeomThread.loadSkinnedGeometry('vrhands/hand_' + _type);
        self.flag('loaded', true);
        (_mesh = new Skin(_geom, self.shader, _geom.bones)).root.rotation.x = Math.PI / 2;
        _mesh.scale.setScalar(0.01);
        self.add(_mesh);
        _mesh.frustumCulled = false;
        RenderManager.camera.wrapper.add(self.group);
      })();
      (function mapBones() {
        let findBone = (name) => {
          for (let i = 0; i < _mesh.bones.length; i++)
            if (_mesh.bones[i].name == name) return _mesh.bones[i];
        };
        [
          'b_%_wrist',
          'b_%_thumb1',
          'b_%_thumb2',
          'b_%_thumb3',
          'b_%_thumb_null',
          'b_%_index0',
          'b_%_index1',
          'b_%_index2',
          'b_%_index3',
          'b_%_index_null',
          'b_%_middle0',
          'b_%_middle1',
          'b_%_middle2',
          'b_%_middle3',
          'b_%_middle_null',
          'b_%_ring0',
          'b_%_ring1',
          'b_%_ring2',
          'b_%_ring3',
          'b_%_ring_null',
          'b_%_pinky0',
          'b_%_pinky1',
          'b_%_pinky2',
          'b_%_pinky3',
          'b_%_pinky_null',
        ].forEach((boneName) => {
          if (boneName) {
            boneName = boneName.replace('%', 'right' === _type ? 'r' : 'l');
            const bone = findBone(boneName);
            boneName.includes('null') &&
              self.tips.push(
                self.initClass(VRHandFingerTip, bone, findBone(boneName.replace('_null', '3'))),
              );
            boneName.includes('middle1') &&
              (_center = self.initClass(
                VRHandFingerTip,
                bone,
                findBone(boneName.replace('_middle1', '_middle0')),
              ));
            _bones.push(bone);
          } else _bones.push(null);
        });
      })();
    })();
    this.update = function (frame, hand, ref) {
      if (_mesh) {
        for (let i = 0; i < joints.length; i++) {
          let jointSpace = hand.get(joints[i]);
          if (jointSpace) {
            let jointPose = frame.getJointPose(jointSpace, ref);
            _bones[i] &&
              jointPose &&
              (_bones[i].position.copy(jointPose.transform.position).multiplyScalar(100),
              _bones[i].quaternion.copy(jointPose.transform.orientation));
          }
        }
        _center.update();
        self.body.position.x = _center.position.x;
        self.body.position.y = _center.position.y;
        self.body.position.z = _center.position.z;
        self.body.matrix.elements[12] = self.body.matrixWorld.elements[12] = _center.position.x;
        self.body.matrix.elements[13] = self.body.matrixWorld.elements[13] = _center.position.y;
        self.body.matrix.elements[14] = self.body.matrixWorld.elements[14] = _center.position.z;
        self.group.updateMatrixWorld(true);
      }
    };
    this.useShader = function (shader) {
      _mesh.shader = shader;
    };
    this.ready = function () {
      return self.wait('loaded');
    };
    this.get('thumb', (_) => self.tips[0]);
    this.get('index', (_) => self.tips[1]);
    this.get('middle', (_) => self.tips[2]);
    this.get('ring', (_) => self.tips[3]);
    this.get('pinky', (_) => self.tips[4]);
  },
  (_) => {
    VRInputHand.PINCH = 'vr_hand_pinch';
  },
);
