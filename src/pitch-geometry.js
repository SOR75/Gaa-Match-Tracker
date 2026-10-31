// Existing viewBox/6-units-per-metre scale; full 40m geometry is shared by drawing and classification.
// Coordinates remain canonical: the attacking goal is at the top in storage.
export const PITCH_GEOMETRY = Object.freeze({
  width: 600,
  height: 900,
  left: 20,
  right: 580,
  topGoal: 20,
  bottomGoal: 880,
  centreX: 300,
  fortyRadius: 240,
  topArcJoin: 145,
  bottomArcJoin: 755,
});
export function fortyMetreArcPaths() {
  const g = PITCH_GEOMETRY;
  const left = g.centreX - g.fortyRadius, right = g.centreX + g.fortyRadius;
  return [
    `M${left} ${g.topGoal}A${g.fortyRadius} ${g.fortyRadius} 0 0 0 ${right} ${g.topGoal}`,
    `M${left} ${g.bottomGoal}A${g.fortyRadius} ${g.fortyRadius} 0 0 1 ${right} ${g.bottomGoal}`,
  ];
}
// Events are already attacking-top coordinates, independent of team and half.
// Do not apply attackingDirection() again to stored shots.
export function fortyMetreLocationZone(event) {
  const g = PITCH_GEOMETRY;
  if (!Number.isFinite(event.shotX) || !Number.isFinite(event.shotY)) return "unknown";
  const x = event.shotX * g.width, y = event.shotY * g.height;
  if (x < g.left || x > g.right || y < g.topGoal || y > g.bottomGoal) return "unknown";
  // Same centre, scale and radius as the SVG. Numerical boundary tolerance is
  // one millionth of a viewBox unit, not a horizontal/20m-line exception.
  return Math.hypot(x-g.centreX,y-g.topGoal) < g.fortyRadius-1e-6 ? "inside" : "outside";
}
export const invalidTwoPointLocation = event => event.event === "two-point" && fortyMetreLocationZone(event) === "inside";
export function fortyMetreZone(event) {
  // Never override a contradictory coordinate to invent an outside location.
  return invalidTwoPointLocation(event) ? "unknown" : fortyMetreLocationZone(event);
}
