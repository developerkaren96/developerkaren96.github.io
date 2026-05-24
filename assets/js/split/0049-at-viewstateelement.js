/*
 * ViewStateElement — marker mixin. Inheriting from this just stamps
 * `viewStateElement = true` on the instance so consumer code (notably
 * ViewState) can detect that a given view participates in the StateArray
 * binding contract.
 */
Class(function ViewStateElement() {
  this.viewStateElement = true;
});
