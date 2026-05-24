/*
 * PhysicalLink2 — v2 sibling of PhysicalLink (0286). Same instance
 * adapter shape but bound to PhysicalSync2's transport. See 0286
 * for the per-method walkthrough.
 */
Class(function PhysicalLink2(_id) {
  const self = this;
  var _events = {},
    _globalEvents = {},
    _globalLinks = [];
  this.initLink = function (id) {
    _id = id;
    PhysicalSync2.createInstanceLink(self, id);
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
    _id ? PhysicalSync2.createRemoteLink(obj, _id, id) : PhysicalSync2.createLocalLink(obj, id);
  };
  this.bindEvent = function (name, callback) {
    _events[name] = callback;
    PhysicalSync2.createRemoteEvent(name, _id, callback);
  };
  this.bindGlobal = function (obj, id) {
    PhysicalSync2.createGlobalLink(obj, id);
    _globalLinks.push(id);
  };
  this.bindGlobalEvent = function (name, callback) {
    PhysicalSync2.createGlobalEvent(name, callback);
    _globalEvents[name] = callback;
  };
  this.fireEvent = function (name, data = {}) {
    PhysicalSync2.fireLocalEvent(name, data);
    _events[name] && _events[name](data);
    _globalEvents[name] && _globalEvents[name](data);
  };
  this.destroyLink = function () {
    PhysicalSync2.deleteInstanceLink(_id);
    _globalLinks.forEach((id) => PhysicalSync2.deleteGlobalLink(id));
    for (let key in _globalEvents) PhysicalSync2.deleteGlobalEvent(key);
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
