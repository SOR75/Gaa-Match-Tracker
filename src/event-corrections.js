import { fieldState } from './field-state.js';

// Explicit corrections operate on the selected ledger row only. References and
// replay-dependent facts must be resolved in their own editors before deletion.
export function eventDeletion(match, id) {
  const matches = match.events.filter(e => e.id === id);
  if (matches.length > 1) throw new Error('Resolve the conflicting event ID before deleting. Nothing has been deleted.');
  const event = matches[0];
  if (!event) throw new Error('This event has already been removed.');
  const linked = match.events.filter(e => e.id !== id &&
    [e.directScoreLink, e.buildUpLink, e.cardId].includes(id));
  if (linked.length) throw new Error(`Resolve linked events before deleting this event: ${linked.map(e => e.id).join(', ')}. Edit or remove those links explicitly; nothing has been deleted.`);
  const events = match.events.filter(e => e.id !== id);
  const before = fieldState(match), after = fieldState({ ...match, events });
  const dependent = new Set([...after.invalidEvents.keys()].filter(key => !before.invalidEvents.has(key)));
  if (event.event === 'substitution' || event.disciplineVersion === 1) {
    // Legacy replay tolerates some bench attribution. A new explicit deletion
    // must not turn previously eligible recorded participation into off-field
    // attribution merely because that compatibility path tolerates it.
    for (const row of events) {
      const prior = fieldState(match, { beforeEvent: row });
      const next = fieldState({ ...match, events }, { beforeEvent: row });
      if (!prior.attributionError(row, true) && next.attributionError(row, true)) dependent.add(row.id);
    }
  }
  if (dependent.size) throw new Error(`Resolve dependent player/discipline actions before deleting this event: ${[...dependent].join(', ')}. Nothing has been deleted.`);
  return events;
}

// Unknown historical timing cannot establish an Active XV: keep that team's
// roster available for explicit correction without inventing a time boundary.
export const editRosterOptions = event => {
  const known = [1, 2, 3, 4].includes(event.half) && Number.isFinite(event.timeMs) && event.timeMs >= 0;
  return { includeInactive: !known, beforeEvent: known ? event : null };
};
