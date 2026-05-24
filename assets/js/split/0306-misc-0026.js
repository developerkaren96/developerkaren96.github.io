/*
 * Static scratch matrix for Skin (0305). Shared by all Skin
 * instances and reused inside `updateMatrixWorld` to avoid a
 * per-bone Matrix4 allocation each frame.
 */
Skin.tempMat4 = new Matrix4();
