// Only explicitly versioned captures use the paired possession-change model.
// Unmarked historical turnovers retain their original independent semantics.
export const isTurnover = event => ['turnover-won', 'turnover-lost'].includes(event.event);
export const isPairedTurnover = event => isTurnover(event) && event.pairedTurnoverVersion === 1;
export const turnoverTeams = event => ({
  winningTeam: event.event === 'turnover-won' ? 'our' : 'opposition',
  losingTeam: event.event === 'turnover-won' ? 'opposition' : 'our',
});
const jersey = value => typeof value === 'string' && /^[1-9]\d?$/.test(value);
export function pairedTurnoverFields(event) {
  if (!isPairedTurnover(event)) return {};
  const number = event.event === 'turnover-won' ? event.turnoverWinnerNumber : event.turnoverLoserNumber;
  return { ...turnoverTeams(event), team: 'our', playerNumber: number || '' };
}
export function validPairedTurnover(event) {
  if (event.pairedTurnoverVersion === undefined) return true;
  if (!isPairedTurnover(event) || event.team !== 'our') return false;
  const teams = turnoverTeams(event);
  const ours = event.event === 'turnover-won' ? event.turnoverWinnerNumber : event.turnoverLoserNumber;
  const theirs = event.event === 'turnover-won' ? event.turnoverLoserNumber : event.turnoverWinnerNumber;
  return event.winningTeam === teams.winningTeam && event.losingTeam === teams.losingTeam &&
    jersey(ours) && (theirs === '' || jersey(theirs)) && event.playerNumber === ours;
}
