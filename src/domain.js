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
  { id: "miss", label: "Wide / Miss", value: 0, outcome: "wide", player: true },
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
    team: "our",
  },
  {
    id: "turnover-lost",
    label: "Turnover Lost",
    value: 0,
    outcome: "lost",
    team: "our",
  },
  { id: "interception", label: "Interception", value: 0, outcome: "won" },
  { id: "possession", label: "Possession", value: 0, outcome: "" },
];
export const eventType = (id) => EVENT_TYPES.find((type) => type.id === id);
export const uid = () => crypto.randomUUID();
export function blankMatch() {
  return {
    schemaVersion: 1,
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
    createdAt: new Date(now).toISOString(),
  };
}
export function normalizeEvent(event) {
  const type = eventType(event.event);
  if (!type) throw new Error("Unknown event type");
  return {
    ...event,
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
    value?.schemaVersion === 1 &&
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
    Array.isArray(value.events) &&
    value.events.every(
      (event) =>
        typeof event.id === "string" &&
        eventType(event.event) &&
        ["our", "opposition"].includes(event.team) &&
        [1, 2].includes(event.half) &&
        Number.isFinite(event.timeMs) &&
        event.timeMs >= 0 &&
        typeof event.outcome === "string",
    ) &&
    value.clock &&
    [1, 2].includes(value.clock.half) &&
    Number.isFinite(value.clock.elapsedMs) &&
    value.clock.elapsedMs >= 0 &&
    (value.clock.startedAt === null || Number.isFinite(value.clock.startedAt))
  );
}
