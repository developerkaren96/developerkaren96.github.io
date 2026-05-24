/*
 * TemplateRoot — base for the tagged-template-literal templating system
 * (TemplateHTML and TemplateCSS extend it).
 *
 * A template is built by the `html` / `css` tag functions in
 * `0037-misc-0005.js`, which leave behind unique `{{hydra-N}}` markers
 * wherever a `${value}` interpolation appeared. The actual interpolated
 * values land in the `values` map keyed by that marker.
 *
 *   consolidate()
 *     Walks `this.values` and inlines any nested TemplateHTML and arrays of
 *     TemplateHTML directly into the parent template's marker positions —
 *     so the final string only contains "leaf" markers (whose values are
 *     primitives, AppState bindings, or `@style` objects).
 *
 *   modifyMarkers(template, config, dataMarkers, bindings)
 *     Two regex passes over the now-flattened template string:
 *
 *     1. Event-attribute rewrite:  `@click="{{hydra-N}}"`  is replaced by a
 *        `data-attach-event-K="click|{{hydra-N}}"` placeholder. The original
 *        `{{hydra-N}}` survives untouched at the value side. The data-attr
 *        token is recorded in `dataMarkers` so `TemplateHTML.inflate` can
 *        find the element and wire `addEventListener('click', cb)` after
 *        parsing — querying by attribute is the only reliable way to map
 *        marker → element after the browser DOM parser is done.
 *
 *     2. Body-marker substitution: for each remaining `{{hydra-N}}` in the
 *        template, either
 *          • record it in `bindings` for later `state.bind()` (the marker
 *            text remains as-is so the inflator can locate it),
 *          • expand `@style: { ... }` objects into CSS strings inline
 *            (kebab-cases keys), or
 *          • substitute the marker for the literal string/number value.
 */
class TemplateRoot {
  constructor(string, values) {
    this.string = string;
    this.values = values;
  }

  /*
   * Inline nested templates so the result is a single flat string with
   * primitive-valued markers.
   */
  consolidate() {
    let template = this.string;
    const consolidatedValues = {};
    for (const [marker, value] of Object.entries(this.values)) {
      if (value instanceof TemplateHTML) {
        const [innerTemplate, innerValues] = value.consolidate();
        template = template.replace(marker, innerTemplate);
        Object.assign(consolidatedValues, innerValues);
      } else if (Array.isArray(value)) {
        // Array → concatenate all child templates in order.
        let childTemplate = '';
        for (let k = 0; k < value.length; k++) {
          const [innerString, innerValue] = value[k].consolidate();
          childTemplate += innerString;
          Object.assign(consolidatedValues, innerValue);
        }
        template = template.replace(marker, childTemplate);
      } else {
        // Leaf — defer substitution to modifyMarkers, but record the value.
        consolidatedValues[marker] = value;
      }
    }
    return [template, consolidatedValues];
  }

  modifyMarkers(template, config, dataMarkers, bindings) {
    let count = 0;
    return template
      // `@event="{{hydra-N}}"` → `data-attach-event-K="event|{{hydra-N}}"`.
      // `dataMarkers` accumulates the unique attribute names so the inflator
      // can resolve them.
      .replace(/@([a-z]+)="\{\{(hydra-[0-9]+)\}\}"/g, function (_, event, marker) {
        const dataMarker = 'data-attach-event-' + count++;
        dataMarkers.push(dataMarker);
        return `${dataMarker}="${event}|${marker}"`;
      })
      // Body-position `{{hydra-N}}` markers.
      .replace(/\{\{hydra-[0-9]+\}\}/g, function (marker) {
        // Stateful binding — preserve the marker, just remember which key.
        if (config[marker] && config[marker].state) {
          bindings.push({ lookup: marker.trim() });
          return marker;
        }
        // Inline `@style: { ... }` block → flattened CSS string.
        if (config[marker]['@style']) {
          const styles = config[marker]['@style'];
          if (!styles || 'object' != typeof styles) {
            console.error('@style must contain an object');
            return;
          }
          let styleString = '';
          Object.keys(styles).forEach((prop) => {
            const kebabProp = prop.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
            styleString += `${kebabProp}: ${styles[prop]};\n`;
          });
          return styleString;
        }
        // Plain primitive — just substitute.
        return config[marker];
      });
  }
}
