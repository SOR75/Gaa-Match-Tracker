// Existing V0.3.6 viewBox and arc geometry, shared by drawing and classification.
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
  const offset = Math.sqrt(
    g.fortyRadius ** 2 - (g.topArcJoin - g.topGoal) ** 2,
  );
  const left = (g.centreX - offset).toFixed(3);
  const right = (g.centreX + offset).toFixed(3);
  return [
    `M${left} ${g.topArcJoin}A${g.fortyRadius} ${g.fortyRadius} 0 0 0 ${right} ${g.topArcJoin}`,
    `M${left} ${g.bottomArcJoin}A${g.fortyRadius} ${g.fortyRadius} 0 0 1 ${right} ${g.bottomArcJoin}`,
  ];
}
export function fortyMetreZone(event) {
  const g = PITCH_GEOMETRY;
  if (!Number.isFinite(event.shotX) || !Number.isFinite(event.shotY))
    return "unknown";
  const x = event.shotX * g.width,
    y = event.shotY * g.height;
  if (x < g.left || x > g.right || y < g.topGoal || y > g.bottomGoal)
    return "unknown";
  // The drawn arc joins the existing 20m line. The inside region includes the
  // full-width area goal-side of that line plus the circular segment beyond it.
  // Exactly on the arc/join line is inside (epsilon = 0.000001 viewBox units).
  return y <= g.topArcJoin + 1e-6 ||
    Math.hypot(x - g.centreX, y - g.topGoal) <= g.fortyRadius + 1e-6
    ? "inside"
    : "outside";
}
