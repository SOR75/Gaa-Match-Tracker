export const EVENT_TYPES = [
  { id: "goal", label: "Goal", value: 3, outcome: "scored", player: true },
  { id: "point", label: "Point", value: 1, outcome: "scored", player: true },
  {
    id: "two-point",
    label: "2 Point",
    value: 2,
    outcome: "scored",
    player: true,
  },
  {
    id: "miss",
    label: "Wide / Miss",
    value: 0,
    outcome: "missed",
    player: true,
  },
  {
    id: "our-kickout",
    label: "Our Kickout",
    value: 0,
    outcome: "",
    team: "our",
  },
  {
    id: "opposition-kickout",
    label: "Opposition Kickout",
    value: 0,
    outcome: "",
    team: "opposition",
  },
  {
    id: "turnover-won",
    label: "Turnover Won",
    value: 0,
    outcome: "won",
  },
  {
    id: "turnover-lost",
    label: "Turnover Lost",
    value: 0,
    outcome: "lost",
  },
  { id: "interception", label: "Interception", value: 0, outcome: "won" },
  { id: "possession", label: "Possession", value: 0, outcome: "" },
];
export const eventType = (id) => EVENT_TYPES.find((type) => type.id === id);
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues is also available on a plain HTTP LAN development origin.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function blankMatch() {
  return {
    schemaVersion: 2,
    id: uid(),
    setup: {
      ourTeam: "",
      opposition: "",
      competition: "",
      venue: "",
      date: localDate(),
      halfLength: 30,
      coach: "",
    },
    players: [],
    oppositionPlayers: [],
    events: [],
    clock: { half: 1, elapsedMs: 0, startedAt: null },
  };
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function elapsedMs(clock, now = Date.now()) {
  return (
    clock.elapsedMs +
    (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt))
  );
}
export function toggleClock(clock, now = Date.now()) {
  return clock.startedAt === null
    ? { ...clock, startedAt: now }
    : { ...clock, elapsedMs: elapsedMs(clock, now), startedAt: null };
}
export function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function totals(events, team) {
  return events
    .filter((event) => event.team === team)
    .reduce(
      (score, event) => {
        const type = eventType(event.event);
        if (type?.value > 0 && event.outcome === "scored") {
          score.total += type.value;
          if (event.event === "goal") score.goals++;
          if (event.event === "point") score.points++;
          if (event.event === "two-point") score.twoPointers++;
        }
        return score;
      },
      { goals: 0, points: 0, twoPointers: 0, total: 0 },
    );
}
export function createEvent(match, typeId, team, now = Date.now()) {
  const type = eventType(typeId);
  if (!type) throw new Error("Unknown event type");
  return {
    id: uid(),
    half: match.clock.half,
    timeMs: Math.floor(elapsedMs(match.clock, now) / 1000) * 1000,
    team: type.team || team,
    playerNumber: "",
    event: typeId,
    outcome: type.outcome,
    scoreValue: type.value,
    zone: "",
    side: "",
    kickoutLength: "",
    notes: "",
    scoreOrigin: "",
    possessionResult: "",
    attackPattern: "",
    coachObservation: "",
    directScoreLink: "",
    shotX: null,
    shotY: null,
    dictatedNote: "",
    createdAt: new Date(now).toISOString(),
  };
}
export function normalizeEvent(event) {
  const type = eventType(event.event);
  if (!type) throw new Error("Unknown event type");
  const shotX = event.shotX ?? null,
    shotY = event.shotY ?? null;
  if (!(
    (shotX === null && shotY === null) ||
    (Number.isFinite(shotX) &&
      shotX >= 0 &&
      shotX <= 1 &&
      Number.isFinite(shotY) &&
      shotY >= 0 &&
      shotY <= 1)
  ))
    throw new Error("Shot coordinates must both be within 0–1 or both empty.");
  return {
    ...event,
    shotX,
    shotY,
    dictatedNote: event.dictatedNote ?? "",
    team: type.team || event.team,
    scoreValue: event.outcome === "scored" ? type.value : 0,
  };
}
export function saveEvent(events, event) {
  const normalized = normalizeEvent(event);
  const updated = events.some((item) => item.id === event.id)
    ? events.map((item) => (item.id === event.id ? normalized : item))
    : [...events, normalized];
  const scores = new Set(
    updated
      .filter(
        (item) => eventType(item.event)?.value > 0 && item.outcome === "scored",
      )
      .map((item) => item.id),
  );
  return updated.map((item) =>
    item.directScoreLink &&
    (!scores.has(item.directScoreLink) || item.directScoreLink === item.id)
      ? { ...item, directScoreLink: "" }
      : item,
  );
}
export function undoEvent(events) {
  // Recording order stays stable when an event is edited or its match time changes.
  const removed = events.at(-1);
  return events
    .slice(0, -1)
    .map((item) =>
      item.directScoreLink === removed?.id
        ? { ...item, directScoreLink: "" }
        : item,
    );
}
export function validMatch(value) {
  return (
    [1, 2].includes(value?.schemaVersion) &&
    typeof value.id === "string" &&
    value.setup &&
    ["ourTeam", "opposition", "competition", "venue", "date", "coach"].every(
      (key) => typeof value.setup[key] === "string",
    ) &&
    Number.isInteger(value.setup.halfLength) &&
    value.setup.halfLength >= 1 &&
    value.setup.halfLength <= 90 &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        Number.isInteger(player.number) &&
        player.number >= 1 &&
        player.number <= 99 &&
        ["starter", "substitute"].includes(player.role),
    ) &&
    (value.schemaVersion === 1 ||
      (Array.isArray(value.oppositionPlayers) &&
        value.oppositionPlayers.every(validPlayer))) &&
    Array.isArray(value.events) &&
    value.events.every(
      (event) =>
        typeof event.id === "string" &&
        eventType(event.event) &&
        ["our", "opposition"].includes(event.team) &&
        [1, 2].includes(event.half) &&
        Number.isFinite(event.timeMs) &&
        event.timeMs >= 0 &&
        typeof event.outcome === "string" &&
        (value.schemaVersion === 1 ||
          (typeof event.dictatedNote === "string" &&
            ((event.shotX === null && event.shotY === null) ||
              (Number.isFinite(event.shotX) &&
                event.shotX >= 0 &&
                event.shotX <= 1 &&
                Number.isFinite(event.shotY) &&
                event.shotY >= 0 &&
                event.shotY <= 1)))),
    ) &&
    value.clock &&
    [1, 2].includes(value.clock.half) &&
    Number.isFinite(value.clock.elapsedMs) &&
    value.clock.elapsedMs >= 0 &&
    (value.clock.startedAt === null || Number.isFinite(value.clock.startedAt))
  );
}

export function validPlayer(player) {
  return (
    player &&
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    Number.isInteger(player.number) &&
    player.number >= 1 &&
    player.number <= 99 &&
    ["starter", "substitute"].includes(player.role)
  );
}
export const playersFor = (match, team) =>
  team === "our" ? match.players : match.oppositionPlayers;
export const isShot = (event) =>
  ["goal", "point", "two-point", "miss"].includes(event.event);
export const isKickout = (event) =>
  ["our-kickout", "opposition-kickout"].includes(event.event);
// Only new capture uses inference; migration preserves recorded legacy outcomes exactly.
export function inferredOutcome(typeId) {
  return eventType(typeId)?.outcome ?? "";
}
export function migrateMatch(value) {
  if (!validMatch(value)) throw new Error("Invalid saved match");
  if (value.schemaVersion === 2) return structuredClone(value);
  return {
    ...structuredClone(value),
    schemaVersion: 2,
    oppositionPlayers: [],
    events: value.events.map((event) => ({
      ...event,
      shotX: null,
      shotY: null,
      dictatedNote: "",
    })),
  };
}
export function normalizedLocation(clientX, clientY, rect) {
  if (!rect.width || !rect.height) return null;
  return {
    shotX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    shotY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}
