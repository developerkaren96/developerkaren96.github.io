/*
 * LinkedList — intrusive circular doubly-linked list.
 *
 * "Intrusive" — instead of allocating wrapper nodes, prev/next pointers
 * live directly on the inserted object under Symbol-keyed slots
 * (`prevKey` / `nextKey`). Falls back to string keys `__prev`/`__next` in
 * old engines without Symbol.
 *
 * "Circular" — `last.next === first` and `first.prev === last`. Empty list
 * is signalled by `first === null`.
 *
 * Iteration:
 *
 *   for (let n = list.start(); n; n = list.next()) {
 *     // visit each node exactly once
 *   }
 *
 * Prototype methods are installed lazily on the first construction (the
 * `undefined === prototype.push` guard), so multiple lists share methods.
 */
Class(function LinkedList() {
  const prototype = LinkedList.prototype;

  this.length = 0;
  this.first = null;
  this.last = null;
  this.current = null;
  this.prev = null;

  // Unique per-list slot keys. Symbols when available — fully transparent
  // to JSON serialization and `for…in`, and isolated between lists.
  if (typeof Symbol === 'function') {
    this.prevKey = Symbol('prev');
    this.nextKey = Symbol('next');
  } else {
    this.prevKey = '__prev';
    this.nextKey = '__next';
  }

  // Lazy install of prototype methods (shared across instances).
  if (prototype.push !== undefined) return;

  prototype.push = function (obj) {
    // If `obj` is already in a list, remove it first.
    if (obj[this.nextKey]) this.remove(obj);

    if (this.first) {
      // Insert at tail, maintaining circular wraparound.
      obj[this.nextKey] = this.first;
      obj[this.prevKey] = this.last;
      this.last[this.nextKey] = obj;
      this.last = obj;
    } else {
      // Empty list — first/last both point at `obj`, which points at itself.
      this.first = obj;
      this.last = obj;
      obj[this.prevKey] = obj;
      obj[this.nextKey] = obj;
    }
    this.length++;
  };

  prototype.remove = function (obj) {
    // Must be a member: skip if the object has no list pointer.
    if (!obj || !obj[this.nextKey]) return;

    if (this.length <= 1) {
      this.empty();
    } else {
      if (obj === this.first) {
        // Removing head: advance head, rewire wraparound.
        this.first = obj[this.nextKey];
        this.last[this.nextKey] = this.first;
        this.first[this.prevKey] = this.last;
      } else if (obj === this.last) {
        // Removing tail: rewind tail, rewire wraparound.
        this.last = obj[this.prevKey];
        this.last[this.nextKey] = this.first;
        this.first[this.prevKey] = this.last;
      } else {
        // Middle node — splice in place.
        obj[this.prevKey][this.nextKey] = obj[this.nextKey];
        obj[this.nextKey][this.prevKey] = obj[this.prevKey];
      }
      this.length--;
    }

    obj[this.prevKey] = null;
    obj[this.nextKey] = null;
  };

  prototype.empty = function () {
    this.first = null;
    this.last = null;
    this.current = null;
    this.prev = null;
    this.length = 0;
  };

  /** Begin iteration. Returns the first node, or null if empty. */
  prototype.start = function () {
    this.current = this.first;
    this.prev = this.current;
    return this.current;
  };

  /**
   * Advance iteration. Returns the next node, or `undefined` once the
   * iterator has wrapped around to the start (preventing infinite loop on
   * a circular list).
   */
  prototype.next = function () {
    if (!this.current) return;
    this.current = this.current[this.nextKey];
    // Stop condition: we've just stepped from `last → first`. Equivalent to
    // `prev.next === first`, with a special-case for single-element lists.
    if (this.length === 1) return;
    if (this.prev[this.nextKey] === this.first) return;
    this.prev = this.current;
    return this.current;
  };

  prototype.destroy = function () {
    Utils.nullObject(this);
    return null;
  };
});
