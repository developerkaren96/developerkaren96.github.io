/*
 * DOMAttribute — value-object describing one HTML attribute on an element
 * that is bound to a state value. Created by `TemplateHTML` when an inflated
 * element's attribute string contains a `{{hydra-N}}` marker; the resulting
 * `DOMAttribute` is then handed to `state.bind(key, attrObject)` so the
 * binder can update `belongsTo.setAttribute(name, ...)` when the bound
 * value changes.
 *
 *   { name, value, belongsTo, bindingLookup }
 *     name           — attribute name (e.g. "href").
 *     value          — initial raw value (with the `{{hydra-N}}` token still
 *                      embedded).
 *     belongsTo      — the host DOM element.
 *     bindingLookup  — the marker string itself, used to locate the marker
 *                      inside `value` and to look up the config entry.
 */
class DOMAttribute {
  constructor({ name, value, belongsTo, bindingLookup }) {
    this.name          = name;
    this.value         = value;
    this.belongsTo     = belongsTo;
    this.bindingLookup = bindingLookup;
  }
}
