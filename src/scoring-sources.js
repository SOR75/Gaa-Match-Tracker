import { SHOT_SOURCES, shotDetails, gaelicScore } from './shots.js';

const blank = () => ({ goals: 0, points: 0, twoPointers: 0, total: 0, scores: 0 });
const keys = [...SHOT_SOURCES.map(([id]) => id), 'unknown'];
export const emptyScoringSources = () => Object.fromEntries(keys.map(key => [key, blank()]));
// Read-only: a missing source never inherits the live-capture Open Play default.
export function scoringSourceTotals(events) {
  const result = emptyScoringSources();
  for (const event of events) {
    const shot = shotDetails(event);
    if (!shot || event.outcome !== 'scored' || shot.shotOutcome === 'miss') continue;
    const source = SHOT_SOURCES.some(([id]) => id === shot.shotSource) ? shot.shotSource : 'unknown';
    const tally = result[source];
    tally.scores++;
    if (event.event === 'goal') { tally.goals++; tally.total += 3; }
    if (event.event === 'point') { tally.points++; tally.total++; }
    if (event.event === 'two-point') { tally.twoPointers++; tally.total += 2; }
  }
  return result;
}
export function mergeScoringSources(groups) {
  const result = emptyScoringSources();
  for (const group of groups) for (const key of keys) for (const field of Object.keys(result[key]))
    result[key][field] += group?.[key]?.[field] || 0;
  return result;
}
const sourceLabel = (key, count) => ({
  'open-play': 'Play', free: count === 1 ? 'Free' : 'Frees',
  penalty: count === 1 ? 'Penalty' : 'Penalties', '45': count === 1 ? '45' : '45s',
  unknown: 'Unknown source',
})[key];
export function scoringSourceRows(sources) {
  return keys.filter(key => sources?.[key]?.scores > 0).map(key => ({
    key, label: sourceLabel(key, sources[key].scores), ...sources[key],
  }));
}
export const twoPointerNote = tally => tally.twoPointers ? ` (${tally.twoPointers} × 2P)` : '';
export function scoringSourceSummary(sources) {
  const rows = scoringSourceRows(sources);
  const gaelic = rows.some(row => row.goals || row.twoPointers);
  return rows.map(row => `${gaelic ? gaelicScore(row) : row.points} ${row.label}${twoPointerNote(row)}`).join(', ');
}
