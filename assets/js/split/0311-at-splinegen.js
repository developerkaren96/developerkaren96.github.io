/*
 * SplineGen — dev-only tool that bakes a HierarchyAnimation track
 * into per-curve position samples and writes them to disk. Used in
 * the authoring pipeline to convert exported keyframe rigs into
 * compact spline lookup tables consumable by SplineParticles
 * (0313/0314).
 *
 * UIL panel (under "Spline Gen" folder, closed by default):
 *   - subdivide  (number, default 100) — samples per group.
 *   - File       (file picker)         — source JSON path → `_file`.
 *   - Run        (button)              — invokes `exec()`.
 *
 * `exec()`:
 *   - Guarded by `self.flag('building')` so concurrent clicks no-op.
 *   - Fetches the chosen JSON, hands it to an internal `Generator`
 *     which (via `connect`) gives HierarchyAnimation a fresh Group
 *     per hierarchy node and pushes all-but-the-first into `_groups`
 *     (root is dropped — only child curves are baked).
 *   - For each child group, walks `elapsed` from `1/COUNT` to `1.0`,
 *     calls `_animation.update()`, and harvests `group.position`
 *     as a flat [x0,y0,z0, x1,y1,z1, ...] array with 2-decimal
 *     precision.
 *   - Writes the resulting array of arrays to the source path with
 *     `-SPLINES.js?compress` suffix via `Dev.writeFile` (compresses
 *     before flushing).
 *
 * No runtime cost outside dev — the panel attaches to `UIL.global`,
 * which is gated by author-tooling builds.
 */
Class(function SplineGen() {
  Inherit(this, Component);
  const self = this;
  var _file,
    _subdivide = 100;
  async function exec() {
    if (self.flag('building')) return;
    self.flag('building', true);
    let json = await get(_file),
      array = [],
      generator = self.initClass(Generator, json),
      data = await generator.exec();
    array = [...array, ...data];
    let output = _file.split('.js').join('-SPLINES.js');
    Dev.writeFile(output + '?compress', array);
    alert('Conversion complete!');
    self.flag('building', false);
  }
  function Generator(_data) {
    Inherit(this, Component);
    var _animation;
    const COUNT = _subdivide;
    var _groups = [];
    function connect(hierarchy) {
      let array = [];
      for (let i = 0; i < hierarchy.length; i++) {
        let group = new Group();
        array.push(group);
        i > 0 && _groups.push(group);
      }
      return array;
    }
    _animation = this.initClass(HierarchyAnimation, _data, connect);
    this.exec = async function () {
      await _animation.ready();
      let results = [];
      return (
        _groups.forEach((group, index) => {
          let array = [];
          for (let i = 0; i < COUNT; i++) {
            _animation.elapsed = (i + 1) / COUNT;
            _animation.update();
            let pos = group.position.toArray();
            array.push(
              Number(pos[0].toFixed(2)),
              Number(pos[1].toFixed(2)),
              Number(pos[2].toFixed(2)),
            );
          }
          results.push(array);
          console.log((index + 1) / _groups.length);
        }),
        results
      );
    };
  }
  !(function () {
    let folder = new UILFolder('splinegen', {
      label: 'Spline Gen',
      closed: true,
    });
    UIL.global.add(folder);
    let number = new UILControlNumber('subdivide', {
      value: 100,
      step: 1,
    });
    folder.add(number);
    number.onChange((v) => {
      _subdivide = v;
      console.log(_subdivide);
    });
    let file = new UILControlFile('splinegen_file', {
      label: 'File',
    });
    file.onFinishChange((e) => {
      _file = e.src;
    });
    folder.add(file);
    let button = new UILControlButton('button', {
      actions: [
        {
          title: 'Run',
          callback: exec,
        },
      ],
      hideLabel: true,
    });
    folder.add(button);
  })();
});
