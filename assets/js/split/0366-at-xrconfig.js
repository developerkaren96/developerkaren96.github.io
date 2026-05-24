/*
 * XRConfig — one-shot config helper that copies app-level WebXR
 * preferences onto the singleton `XRDeviceManager` (0367)
 * before VR/AR boot. Intended pattern:
 *   new XRConfig({ hands: true, foveation: 'high', ... });
 *
 * Recognised keys (each only applied if defined):
 *   - `mixedReality` (bool)      → enable AR/MR passthrough.
 *   - `multiview`    (bool)      → request OVR_multiview2.
 *   - `hands`        (bool)      → push 'hand-tracking' onto the
 *     XR `features` list AND flip `VRInput.useControllerHands`
 *     so the input layer (0354) expects hand tracking.
 *   - `foveation`    ('none'|'low'|'medium'|'high') → maps to
 *     `XRDeviceManager.FOVEATION_LEVEL_*`. 'none' → null
 *     (foveation disabled).
 *   - `scaleFactor`  (number)    → XR resolution scale.
 *   - `framerate`    (number)    → target XR fps (e.g. 90, 120).
 *   - `antialias`    (bool)      → MSAA on XR framebuffer.
 *
 * No instance state — just a configuration sink.
 */
Class(function XRConfig(_params) {
  undefined !== _params.mixedReality && (XRDeviceManager.mixedReality = _params.mixedReality);
  undefined !== _params.multiview && (XRDeviceManager.multiview = _params.multiview);
  undefined !== _params.hands &&
    (XRDeviceManager.features.push('hand-tracking'), (VRInput.useControllerHands = true));
  undefined !== _params.foveation &&
    (XRDeviceManager.foveationLevel = (function () {
      switch (_params.foveation) {
        case 'none':
          return null;
        case 'low':
          return XRDeviceManager.FOVEATION_LEVEL_LOW;
        case 'medium':
          return XRDeviceManager.FOVEATION_LEVEL_MEDIUM;
        case 'high':
          return XRDeviceManager.FOVEATION_LEVEL_HIGH;
      }
    })());
  undefined !== _params.scaleFactor && (XRDeviceManager.scaleFactor = _params.scaleFactor);
  undefined !== _params.framerate && (XRDeviceManager.targetFramerate = _params.framerate);
  undefined !== _params.antialias && (XRDeviceManager.antialias = _params.antialias);
});
