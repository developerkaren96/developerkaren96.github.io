/*
 * TemplateHTML — `html\`...\`` tagged-template product. Knows how to inflate
 * itself into a real DOM subtree rooted at `root` (a HydraObject `.div`),
 * wiring up state bindings and event listeners discovered in the template.
 *
 * inflate(root, cssElement)
 *   1. Consolidate nested templates into a single flat string.
 *   2. Run `modifyMarkers` to rewrite `@event="{{...}}"` into
 *      `data-attach-event-K="event|{{...}}"` placeholders and substitute
 *      primitive-valued markers in-place.
 *   3. Wipe the current children of `root`, destroy any prior flat bindings.
 *   4. Parse the rewritten string via `DOMTemplate.parser` and append the
 *      resulting `<body>` content into a fragment.
 *   5. For each parsed element (walking back-to-front so deeper elements
 *      are wired before parents), find `{{hydra-N}}` references in either
 *      attribute values or innerText and call `state.bind(key, target)` to
 *      keep them in sync. Attribute bindings are wrapped in a `DOMAttribute`
 *      helper; text bindings target the element directly.
 *   6. After everything's in the DOM, walk `dataMarkers` to hook up
 *      `addEventListener`s and remove the placeholder attributes.
 *   7. Recursively instantiate nested custom elements (tags containing `-`):
 *      `<my-fragment id="x">` → `new MyFragment()` attached to `#x`.
 *   8. Restore the first child's scroll position (if the previous render
 *      had one).
 *
 * `scrollTop` capture is important when re-rendering live content (e.g. a
 * log list); without it the user would jump to the top on every update.
 */
class TemplateHTML extends TemplateRoot {
  constructor(string, values) {
    super(string, values);
  }

  inflate(root, cssElement) {
    const [template, config] = this.consolidate();
    const dataMarkers      = [];
    const nestedComponents = [];
    const bindings         = new LinkedList();
    const scrollTop        = root.firstChild?.scrollTop;
    const t = this.modifyMarkers(template, config, dataMarkers, bindings);

    // Replace current contents wholesale.
    while (root.firstChild) root.removeChild(root.firstChild);
    if (root.flatBindings) root.flatBindings.forEach((b) => b.destroy());
    root.flatBindings = [];

    const fragment = document.createDocumentFragment();
    const newNode  = DOMTemplate.parser.parseFromString(t, 'text/html');
    const els      = newNode.body.firstChild.querySelectorAll('*');
    const length   = els.length;
    fragment.appendChild(newNode.body.firstChild);
    if (cssElement) fragment.appendChild(cssElement);

    // Walk back-to-front so descendants are wired before their ancestors;
    // also helps because we splice attribute bindings as we go.
    for (let index = length - 1; index > -1; index--) {
      const el = els[index];
      // Custom-element tag → defer instantiation to a separate pass.
      if (~el.tagName.indexOf('-')) nestedComponents.push(el);
      const innerText  = el.innerText;
      const innerHTML  = el.innerHTML;
      const attributes = [...el.attributes].map((a) => ({ name: a.name, value: a.value }));
      // Skip elements that still contain HTML children — bindings only apply
      // to leaf-text elements.
      if (~innerHTML.indexOf('<')) continue;

      let binding = bindings.start();
      while (binding) {
        const bindingLookup = binding.lookup;
        attributes.forEach((attr) => {
          if (~attr?.value?.indexOf(bindingLookup)) {
            const obj = config[bindingLookup];
            const attrObject = new DOMAttribute({
              name:          attr.name,
              value:         el.getAttribute(attr.name),
              belongsTo:     el,
              bindingLookup: bindingLookup,
            });
            root.flatBindings.push(obj.state.bind(obj.key, attrObject));
          }
        });
        if (~innerText.indexOf(bindingLookup)) {
          const obj = config[bindingLookup];
          // `@[key]` form unwraps to the bare key string in display.
          if (~innerText.indexOf('@[')) el.innerText = innerText.replace(bindingLookup, obj.key);
          root.flatBindings.push(obj.state.bind(obj.key, el));
        }
        binding = bindings.next();
      }
    }

    root.appendChild(fragment);

    // Event wiring — `data-attach-event-K="event|{{hydra-N}}"` → addEventListener.
    dataMarkers.forEach((dataMarker) => {
      const element  = root.querySelector(`[${dataMarker}]`);
      const dataEvent = element.getAttribute(dataMarker);
      const [event, marker] = dataEvent.split('|');
      element.removeAttribute(dataMarker);
      element.addEventListener(`${event}`, config[`{{${marker}}}`]);
    });

    // After a paint, instantiate custom-element classes: tag `my-foo` →
    // global `MyFoo` constructor, mounted under `#<id>` and registered as a
    // child with that class name.
    defer(() => {
      nestedComponents.forEach((template) => {
        const className = template.tagName
          .toLowerCase()
          .replace(/(^\w|-\w)/g, (str) => str.replace(/-/, '').toUpperCase());
        $(`#${template.id}`, className, true).add(new window[className]());
      });
    });

    // Preserve the previous scroll position across re-renders.
    if (scrollTop) root.firstChild.scrollTop = scrollTop;
  }
}
