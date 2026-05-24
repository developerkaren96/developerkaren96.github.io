/*
 * Static scratch slots for SkinAnimation (0307). Six globally-
 * shared scratch transforms — prev / next pos/rot/scl — that the
 * per-bone update loop fills with the lerped keyframe values
 * without allocating per frame.
 */
SkinAnimation.tempPos = new Vector3();
SkinAnimation.tempRot = new Quaternion();
SkinAnimation.tempScl = new Vector3();
SkinAnimation.tempPos2 = new Vector3();
SkinAnimation.tempRot2 = new Quaternion();
SkinAnimation.tempScl2 = new Vector3();
