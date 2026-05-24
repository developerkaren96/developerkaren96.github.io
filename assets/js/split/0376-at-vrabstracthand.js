/*
 * VRAbstractHand — base class for hand representations: shared
 * between the synthetic "fake hand" attached to a controller
 * (VRInputControllerHand 0378) and the real hand-tracked hand
 * (VRInputHand 0379). Both modes report fingertips, pinch
 * gestures, and a pointer direction in a uniform way so the
 * input layer (UserInputVRController) can treat them identically.
 *
 * Common fields:
 *   - `isAbstractHand = true` — branch marker for UserInput.
 *   - `pointer` (Vector3) — forward direction (-Z applied by
 *     `index` finger's quaternion) used by raycasters.
 *   - `body`   — Utils3D.createDebug(0.07) collision/proxy
 *     sphere; `neverRender=true` so it doesn't draw.
 *   - `velocity` — VelocityTracker on body.position.
 *
 * Shader: clones a shared `VRAbstractHand.shader` if one was
 * registered (`useShader(...)`), else builds a fresh `VRHand`
 * shader. Each instance gets its own `uColor` uniform (lerped
 * toward target color by `setColor` at 0.07).
 *
 * Per-frame `loop`:
 *   - PhysicalSync realignment (reprojection compensation).
 *   - Pinch detection: when both `thumb` and `index` are
 *     populated (by subclass init), measures distance and
 *     manages a `pinching` flag with hysteresis (start ≤0.015,
 *     end >0.025) — fires `VRInputHand.PINCH {action, hand}`.
 *   - Updates each fingertip via `tips[i].update()`.
 *   - Recomputes `pointer` from `index.quaternion`.
 *
 * Static `VRAbstractHand.useShader(shader)` registers the
 * shared shader instance to clone for subsequent hands —
 * lets the app theme all hands from one source.
 */
Class(
  function VRAbstractHand() {
    Inherit(this, Object3D);
    const self = this;
    this.pointer = new Vector3();
    this.isAbstractHand = true;
    var _targetColor = new Color();
    const PHYSICAL_SYNC = !!window.PhysicalSync;
    function loop() {
      if ((PHYSICAL_SYNC && PhysicalSync.realignObject(self.group), self.thumb)) {
        for (let i = self.tips.length - 1; i > -1; i--) self.tips[i].update();
        self.pointer.set(0, 0, -1).applyQuaternion(self.index.quaternion);
        let distance = self.thumb.position.distanceTo(self.index.position);
        self.flag('pinching') && distance > 0.025
          ? (self.flag('pinching', false),
            self.events.fire(VRInputHand.PINCH, {
              action: 'end',
              hand: self,
            }))
          : !self.flag('pinching') &&
            distance <= 0.015 &&
            (self.flag('pinching', true),
            self.events.fire(VRInputHand.PINCH, {
              action: 'start',
              hand: self,
            }));
      }
      self.index && self.pointer.set(0, 0, -1).applyQuaternion(self.index.quaternion);
    }
    !(function createBody() {
      self.body = Utils3D.createDebug(0.07);
      self.body.shader.neverRender = true;
      let velocity = new VelocityTracker(self.body.position);
      velocity.start();
      self.velocity = velocity.value;
    })();
    (function initShader() {
      self.shader = VRAbstractHand.shader
        ? VRAbstractHand.shader.clone()
        : self.initClass(Shader, 'VRHand', {
            transparent: true,
            uColor: {
              value: new Color('#ffffff'),
            },
            uStatic: {
              value: 0,
            },
          });
      self.shader.uniforms.uColor = {
        value: new Color(),
      };
    })();
    self.startRender(loop);
    self.setColor = function (colorHex) {
      _targetColor.set(colorHex);
      self.shader.uniforms.uColor.value.lerp(_targetColor, 0.07);
    };
    self.setShader = function (shader) {
      self.shader = shader;
    };
  },
  (_) => {
    VRAbstractHand.useShader = function (shader) {
      VRAbstractHand.shader = shader;
    };
  },
);
