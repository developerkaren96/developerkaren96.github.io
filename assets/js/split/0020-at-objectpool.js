/*
 * ObjectPool — fixed-class object pool to avoid GC pressure in hot loops.
 *
 *   const pool = new ObjectPool(Particle, 100);
 *   const p = pool.get();   // recycled if available, else `new Particle()`
 *   // …use…
 *   pool.put(p);            // return for reuse
 *
 * If `type` is omitted, the pool is type-agnostic — `get()` returns null
 * when empty, and the caller is responsible for the construction.
 *
 * Notable choices:
 *   - `get` removes from the *front* (FIFO) so freshly-`put` objects get
 *     a small breather before being reused (helps with caches / animation).
 *   - `put` deduplicates: putting the same object twice is a no-op.
 *   - `insert(arr)` accepts a single object too — for convenience.
 */
Class(function ObjectPool(Type, prefillCount = 10) {
  let pool = [];
  this.array = pool;

  // Pre-fill with `prefillCount` instances when a type is supplied.
  (function prefill() {
    if (!Type) return;
    for (let i = 0; i < prefillCount; i++) pool.push(new Type());
  })();

  /** Grab one — recycled if available, else freshly constructed. */
  this.get = function () {
    return pool.shift() || (Type ? new Type() : null);
  };

  /** Drop every reference (does NOT call .destroy on members). */
  this.empty = function () { pool.length = 0; };

  /** Return an object to the pool (deduplicated). */
  this.put = function (obj) {
    if (obj && !pool.includes(obj)) pool.push(obj);
  };

  /** Return an array (or single object) — useful for batch frees. */
  this.insert = function (arrayOrObj) {
    if (arrayOrObj.push === undefined) arrayOrObj = [arrayOrObj];
    for (let i = 0; i < arrayOrObj.length; i++) this.put(arrayOrObj[i]);
  };

  this.length = function () { return pool.length; };

  /** In-place Fisher–Yates shuffle of the pool order. */
  this.randomize = function () {
    const array = pool;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };

  /** Destroy every pooled object that has its own `.destroy()`. */
  this.destroy = function () {
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].destroy) pool[i].destroy();
    }
    pool = null;
    return null;
  };
});
