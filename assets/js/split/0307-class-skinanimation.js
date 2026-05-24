/*
 * SkinAnimation — keyframe-animation track for a single `Skin`
 * (0305). Holds a per-bone array of `keys` (pos / rot / scl) and
 * advances `elapsed` (in keyframe units) on each `update`.
 *
 * Constructor normalises every input quaternion (animation
 * exporters sometimes ship slightly de-normalised quats which slerp
 * doesn't handle gracefully) by round-tripping each key through
 * `tempRot.set(...).normalize().toArray()`.
 *
 * Drive semantics:
 *   - `duration = numKeys - 1` (the data's `duration` is the index
 *     of the last keyframe), and `numberKeys = duration + 1`.
 *   - `elapsed % numberKeys` wraps. Floor → previous key, +1 mod →
 *     next key, fractional part → lerp weight.
 *   - For each bone, lerps/slerps the prev/next keyframe values
 *     into the static scratch transforms (`tempPos`, `tempRot`,
 *     `tempScl`), then blends those into the live bone transforms
 *     with `animationWeight` (1 if `isSet`, else `weight/total`).
 *     That second blend layer is what lets multiple SkinAnimations
 *     cross-fade (run idle and walk together, weighted).
 *
 * Static scratch (`tempPos`, `tempRot`, `tempScl`, plus `*2`
 * variants) is set up in a sibling file (0308) so the per-frame
 * loop allocates nothing.
 */
class SkinAnimation {
  constructor(skin, data) {
    this.skin = skin;
    this.data = data;
    this.elapsed = 0;
    this.weight = 1;
    this.duration = data.duration;
    this.data.skeleton.forEach((d) => {
      for (let j = 0; j < d.keys.length; j++) {
        SkinAnimation.tempRot.set(...d.keys[j].rot);
        SkinAnimation.tempRot.normalize();
        d.keys[j].rot = SkinAnimation.tempRot.toArray();
      }
    });
  }
  update(totalWeight, isSet) {
    const animationWeight = isSet ? 1 : this.weight / totalWeight,
      numberKeys = this.duration + 1,
      elapsed = this.elapsed % numberKeys;
    let prevKey, nextKey;
    this.data.skeleton.forEach((d, i) => {
      const prev = Math.floor(elapsed),
        next = Math.floor(elapsed + 1) % numberKeys,
        weight = elapsed - prev;
      prevKey = d.keys[prev];
      nextKey = d.keys[next];
      SkinAnimation.tempPos.set(...prevKey.pos);
      SkinAnimation.tempRot.set(...prevKey.rot);
      SkinAnimation.tempScl.set(...prevKey.scl);
      SkinAnimation.tempPos2.set(...nextKey.pos);
      SkinAnimation.tempRot2.set(...nextKey.rot);
      SkinAnimation.tempScl2.set(...nextKey.scl);
      SkinAnimation.tempPos.lerp(SkinAnimation.tempPos2, weight, false);
      SkinAnimation.tempRot.slerp(SkinAnimation.tempRot2, weight, false);
      SkinAnimation.tempScl.lerp(SkinAnimation.tempScl2, weight, false);
      this.skin.bones[i].position.lerp(SkinAnimation.tempPos, animationWeight, false);
      this.skin.bones[i].quaternion.slerp(SkinAnimation.tempRot, animationWeight, false);
      this.skin.bones[i].scale.lerp(SkinAnimation.tempScl, animationWeight, false);
    });
  }
}
