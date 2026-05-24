/*
 * UILGroupBridge — connects the persistent UIL/InputUIL group state
 * to the SceneLayout editor's live StateArrays so a layout's
 * groups/layers and per-object metadata (name, parent, sortIndex)
 * stay synchronised between disk (UILStorage) and the in-app
 * editor.
 *
 * Per-layout `Bridge`:
 *   - `store`  — an InputUIL keyed `scenelayout_${name}` that
 *     holds the JSON blob persisted between sessions.
 *   - `data`   — parsed contents (with -1 sentinels for `layers`
 *     and `groups` so an empty layout is detectable).
 *   - `all` / `layers` / `groups` — reactive StateArrays exposed to
 *     the editor UI; entries are added/removed as the JSON blob is
 *     reconciled with the live SceneLayout.
 *
 * `bindChanges(obj, key)`:
 *   - Awaits the SceneLayout to be ready, then mirrors three
 *     fields (`name`, `sortIndex`, `parent`) into UILStorage via
 *     `bindState`. Edits in the inspector flow straight into the
 *     persisted store under `${key}_name`, `${key}_sortIndex`,
 *     `${key}_parent`.
 *
 * `run()` (later in the file) walks the JSON blob, reconciles it
 * with the live scene graph, and emits add/remove on the
 * StateArrays. The bridge is held per-layout in `_map` keyed by
 * name.
 */
Class(function UILGroupBridge() {
  Inherit(this, Component);
  const self = this;
  var _map = {};
  function Bridge(name) {
    let store = InputUIL.create(`scenelayout_${name}`, null),
      data = JSON.parse(store.get('data') || '{}');
    undefined === data.layers && (data.layers = -1);
    undefined === data.groups && (data.groups = -1);
    var _healedGroups,
      _healedMap,
      _name = name;
    this.all = new StateArray();
    this.layers = new StateArray();
    this.groups = new StateArray();
    const $this = this;
    async function bindChanges(obj, key) {
      await self.wait($this, 'sceneLayout');
      $this.sceneLayout.bindState(obj, 'name', (name) => {
        UILStorage.set(`${key}_name`, name);
      });
      $this.sceneLayout.bindState(obj, 'sortIndex', (index) => {
        UILStorage.set(`${key}_sortIndex`, index);
      });
      $this.sceneLayout.bindState(obj, 'parent', (parent) => {
        UILStorage.set(`${key}_parent`, parent);
      });
    }
    function run() {
      data.groups = Math.max(
        data.groups,
        Number(UILStorage.get(`groupBridge_${name}_groups`)) - 1 || -1,
      );
      let healedGroups = (_healedGroups = Number(UILStorage.get(`groupBridge_${name}healGroups`)));
      healedGroups > 0 && (_healedMap = {});
      for (let i = 0, c = data.layers + 1; i < c; i++) {
        let obj = AppState.createLocal(),
          key = `INPUT_Config_${i}_${name}`;
        obj.deleted = UILStorage.get(`sl_${name}_${i}_deleted`);
        obj.visible = true;
        obj.parent = UILStorage.get(`${key}_parent`);
        obj.name = UILStorage.get(`${key}_name`) || 'layer_' + i;
        obj.id = `sl_${name}_${i}`;
        obj.sortIndex = Number(UILStorage.get(`${key}_sortIndex`));
        isNaN(obj.sortIndex) && (obj.sortIndex = $this.all.length);
        $this.layers.push(obj);
        obj.deleted || $this.all.push(obj);
        obj.type = 'layer';
        bindChanges(obj, key);
      }
      this.groups = new StateArray();
      for (let i = 0, c = data.groups + 1; i < c; i++) {
        if (healedGroups > 0 && i < healedGroups) continue;
        let obj = AppState.createLocal(),
          key = `GROUP_${name}_group_${i}`;
        obj.visible = true;
        obj.children = new StateArray();
        obj.id = `sl_${name}_group_${i}`;
        obj.deleted = UILStorage.get(`groupBridge_${obj.id}_deleted`);
        obj.name = UILStorage.get(`${key}_name`) || 'group_' + i;
        obj.sortIndex = Number(UILStorage.get(`${key}_sortIndex`));
        isNaN(obj.sortIndex) && (obj.sortIndex = $this.all.length);
        $this.groups.push(obj);
        obj.type = 'group';
        self.wait($this, 'sceneLayout').then((_) => {
          $this.sceneLayout._getGroup('group_' + i, healedGroups > 0 ? i : undefined);
        });
        _healedMap && (_healedMap[i] = obj);
        obj.deleted || $this.all.push(obj);
        bindChanges(obj, key);
      }
      $this.all.sort((a, b) => a.sortIndex - b.sortIndex);
    }
    run();
    this.createGroup = async function () {
      let obj = AppState.createLocal();
      obj.deleted = false;
      obj.visible = true;
      obj.type = 'group';
      obj.children = new StateArray();
      obj.sortIndex = this.all.length;
      this.groups.push(obj);
      this.all.push(obj);
      let prevCount = Number(UILStorage.get(`groupBridge_${name}_groups`)) || 0;
      UILStorage.set(`groupBridge_${name}_groups`, prevCount + 1);
      _healedGroups > 0
        ? ((prevCount += _healedGroups),
          this.sceneLayout._getGroup('group_' + prevCount, prevCount),
          (_healedMap[prevCount] = obj))
        : this.sceneLayout._createGroup();
      obj.name = 'group_' + prevCount;
      obj.id = `sl_${name}_group_${prevCount}`;
    };
    this.syncGroup = function (index, name) {
      let obj = AppState.createLocal();
      return (
        (obj.deleted = false),
        (obj.visible = true),
        (obj.type = 'group'),
        (obj.children = new StateArray()),
        (obj.sortIndex = this.all.length),
        this.groups.push(obj),
        this.all.push(obj),
        (obj.name = name),
        (obj.id = `sl_${_name}_${name}`),
        obj
      );
    };
    this.getGroup = function (index) {
      return _healedMap ? _healedMap[index] : this.groups[index];
    };
    this.healGroups = function (index) {
      Number(UILStorage.get(`groupBridge_${name}healGroups`)) > 0 ||
        UILStorage.set(`groupBridge_${name}healGroups`, index);
    };
    this.createLayer = async function (parent) {
      let obj = AppState.createLocal(),
        key = `INPUT_Config_${this.layers.length}_${name}`;
      obj.deleted = false;
      obj.visible = true;
      obj.parent = parent;
      obj.name = 'layer_' + this.layers.length;
      obj.type = 'layer';
      obj.id = `sl_${name}_${this.layers.length}`;
      obj.sortIndex = this.all.length;
      this.layers.push(obj);
      this.all.push(obj);
      let layer = await this.sceneLayout._createLayer();
      obj.name = layer.get('name') || obj.name;
      bindChanges(obj, key);
    };
    this.sync = function () {
      this.all.refresh([]);
      this.layers.refresh([]);
      this.groups.refresh([]);
      run();
    };
    this.deleteNode = function (obj) {
      return obj.children?.length
        ? alert("You can't delete a group with children")
        : confirm('Are you sure you want to delete this layer?')
          ? ((obj.deleted = true),
            this.all.remove(obj),
            'layer' == obj.type && this.sceneLayout._deleteLayer(obj.id, obj.name, true),
            'group' == obj.type &&
              (this.sceneLayout._deleteGroup(obj.id, obj.name, true),
              UILStorage.set(`groupBridge_${obj.id}_deleted`, true)),
            true)
          : undefined;
    };
    this.calculateRenderFraction = async function (index) {
      let parent,
        obj = this.layers[index];
      if (
        (this.groups.forEach((node) => {
          node.id.includes(obj.parent) && (parent = node);
        }),
        !parent)
      )
        return [0, 0];
      let fraction = (parent.children.indexOf(obj) / (parent.children.length - 1)) * 0.99;
      return isNaN(fraction)
        ? (await self.wait(50), this.calculateRenderFraction(index))
        : [fraction, parent.sortIndex];
    };
  }
  this.createSceneLayout = this.create = async function (name, layout) {
    return (
      layout || (await self.wait(_map, name)),
      _map[name] || (_map[name] = new Bridge(name)),
      layout && (_map[name].sceneLayout = layout),
      _map[name]
    );
  };
}, 'static');
