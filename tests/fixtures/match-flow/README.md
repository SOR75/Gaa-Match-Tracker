The Manchans–Vincents partial fixture contains only user-supplied score checkpoints
and factual timeline entries. `id: null` means the original event ID is unavailable.
The six incremental H2 score checkpoints are arithmetic from the supplied 12–7
baseline and six explicitly supplied unanswered points; no missing event is created.
No original match record is altered. No kickout lengths or restart chain invented.

When the real canonical match export is available, put its unchanged match object
in `fullMatch`, retaining provenance. The benchmark test then runs the production
`matchFlow` pipeline, not the sparse-checkpoint diagnostic. Until then, sparse
checkpoints validate general score-window detection only. They do not validate
possession, individual kickouts, original IDs or the complete real-match ranking.
