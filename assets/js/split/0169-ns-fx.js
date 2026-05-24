/*
 * FX namespace declaration — creates the global `FX` object so the
 * effects classes (FXLayer, FXScene, downstream emitter / post-pass
 * modules) can live as `FX.<Name>` without polluting the global scope.
 */
Namespace('FX');
