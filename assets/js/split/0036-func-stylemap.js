/*
 * styleMap — tiny helper that turns a `{ className: truthyOrFalsy }` map
 * into a space-separated class-list string.
 *
 *   styleMap({ active: true, error: false, large: 1 })  →  "active  large"
 *
 * Used inside template render functions to conditionally attach classes:
 *
 *   <div class="${styleMap({ active: this.state.active })}">
 *
 * Falsy values are mapped to empty strings, which then `join(' ')`s into the
 * gap. Trailing/extra whitespace is harmless because the browser collapses
 * it on class-list parse.
 */
function styleMap(object) {
  return Object.keys(object)
    .map((key) => (object[key] ? key : ''))
    .join(' ');
}
