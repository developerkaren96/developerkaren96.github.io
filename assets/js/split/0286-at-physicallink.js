/*
 * PhysicalLink — instance-side adapter that plugs a Player (0273)
 * into the PhysicalSync (0288) transport. Every method here is a
 * thin call into `PhysicalSync.*` annotated with `_id` (the remote
 * peer id; `undefined` means "this is the local player").
 *
 * Linking surface:
 *   - `initLink(id)`        — register this player instance under
 *     `id` so subsequent links can target it.
 *   - `bindLink(obj, key)`  — bidirectional transform replication.
 *     If the input is a GLUIObject (2D UI), the helper bridges
 *     between its `x/y` (stage pixels) and a Group's normalised
 *     `position.x/y`, scaling against `self.stage || Stage`. This
 *     lets 2D UI elements ride the same transform channel that 3D
 *     transforms use. The bridge runs every frame.
 *     Then dispatches:
 *       - Local owner: `createLocalLink(obj, key)`  — outbound.
 *       - Remote proxy: `createRemoteLink(obj, _id, key)` — inbound.
 *   - `bindEvent(name, cb)` — per-instance event channel, fired by
 *     the owning side and received here.
 *   - `bindGlobal(obj, id)` / `bindGlobalEvent(name, cb)` — same
 *     idea but the channel is room-wide, not bound to a specific
 *     player. `_globalLinks` / `_globalEvents` track them for
 *     teardown.
 *   - `fireEvent(name, data)` — fires across the network *and*
 *     dispatches the local handler synchronously (so the local
 *     player sees its own action without waiting for the echo).
 *
 * Teardown:
 *   - `destroyLink()` removes the instance link plus every global
 *     link / event this Component registered.
 *   - The `defer` block at the bottom hooks into the component's
 *     `_bindOnDestroy` so teardown happens automatically when the
 *     owning Component is destroyed.
 *
 * If `_id` is provided at construction, `initLink(_id)` runs
 * immediately (typical for remote-player wrappers).
 */
Class(function PhysicalLink(_id) {
  const self = this;
  var _events = {},
    _globalEvents = {},
    _globalLinks = [];
  this.initLink = function (id) {
    _id = id;
    PhysicalSync.createInstanceLink(self, id);
  };
  this.bindLink = function (obj, id) {
    if (obj instanceof GLUIObject) {
      let gluiObject = obj;
      obj = new Group();
      self.startRender((_) => {
        let stage = self.stage || Stage;
        _id
          ? ((gluiObject.x = obj.position.x * stage.width),
            (gluiObject.y = obj.position.y * stage.height))
          : ((obj.position.x = gluiObject.x / stage.width),
            (obj.position.y = gluiObject.y / stage.height));
      });
    }
    _id ? PhysicalSync.createRemoteLink(obj, _id, id) : PhysicalSync.createLocalLink(obj, id);
  };
  this.bindEvent = function (name, callback) {
    _events[name] = callback;
    PhysicalSync.createRemoteEvent(name, _id, callback);
  };
  this.bindGlobal = function (obj, id) {
    PhysicalSync.createGlobalLink(obj, id);
    _globalLinks.push(id);
  };
  this.bindGlobalEvent = function (name, callback) {
    PhysicalSync.createGlobalEvent(name, callback);
    _globalEvents[name] = callback;
  };
  this.fireEvent = function (name, data = {}) {
    PhysicalSync.fireLocalEvent(name, data);
    _events[name] && _events[name](data);
    _globalEvents[name] && _globalEvents[name](data);
  };
  this.destroyLink = function () {
    PhysicalSync.deleteInstanceLink(_id);
    _globalLinks.forEach((id) => PhysicalSync.deleteGlobalLink(id));
    for (let key in _globalEvents) PhysicalSync.deleteGlobalEvent(key);
  };
  defer((_) => {
    self &&
      self._bindOnDestroy &&
      self._bindOnDestroy((_) => {
        self.destroyLink();
      });
  });
  _id && self.initLink(_id);
});
