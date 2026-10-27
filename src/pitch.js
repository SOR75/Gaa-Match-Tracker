import { isBlockedShot } from "./shots.js";
import { isDefensiveBlockEvent } from "./defensive-blocks.js";
import { transformLocation } from "./matchday.js";
import { esc } from "./ui.js";
export const hasLocation = (event) =>
  Number.isFinite(event.shotX) && Number.isFinite(event.shotY);
export function pitchMarkup(
  events = [],
  interactive = false,
  {
    direction = "top",
    teamName = "",
    interactiveLabel = "Shot location pitch",
    mapLabel = "Shot map",
  } = {},
) {
  return `<svg class="gaelic-pitch ${interactive ? "interactive-pitch" : ""}" viewBox="0 0 600 900" ${interactive ? `role="button" tabindex="0" aria-label="${esc(interactiveLabel)}"` : `role="img" aria-label="${esc(mapLabel)}"`}>
    <rect width="600" height="900" fill="#24573f"/>
    <path d="M0 150H600M0 450H600M0 750H600" stroke="#ffffff09" stroke-width="145"/>
    <!-- 40m radius follows the existing 45m-line scale (270 units / 45m).
         Arcs are centred on the goal lines and meet the existing 20m lines.
         Drawing only: normalized event coordinates and transforms are unchanged. -->
    <g fill="none" stroke="#e2edcb" stroke-width="3" opacity=".8"><rect x="20" y="20" width="560" height="860"/><path d="M20 450H580M20 290H580M20 610H580M20 145H580M20 755H580M220 20V85H380V20M220 880V815H380V880M270 20V55H330V20M270 880V845H330V880M280 20V5M320 20V5M280 880V895M320 880V895"/><circle cx="300" cy="450" r="22"/><path d="M235 145Q300 225 365 145M235 755Q300 675 365 755"/><path class="forty-metre-arc" d="M95.122 145A240 240 0 0 0 504.878 145"/><path class="forty-metre-arc" d="M95.122 755A240 240 0 0 1 504.878 755"/></g>
    <text x="300" y="${direction === "top" ? 115 : 790}" fill="#e4edc9" text-anchor="middle" font-size="17" letter-spacing="3">${esc(teamName)} ATTACKS ${direction === "top" ? "↑ TOP" : "↓ BOTTOM"}</text>
    ${events
      .filter(hasLocation)
      .map((event) => {
        const displayed = transformLocation(event, direction);
        const x = displayed.shotX * 600,
          y = displayed.shotY * 900;
        const type = event.event;
        const blocked = isBlockedShot(event),
          defensive = isDefensiveBlockEvent(event);
        const color =
          type === "goal"
            ? "#e1f690"
            : type === "two-point"
              ? "#9bdcf3"
              : type === "point"
                ? "#ffffff"
                : "#ffb0a3";
        if (blocked)
          return `<g class="shot-marker blocked-shot-marker" data-shot-id="${esc(event.id)}" data-marker-kind="blocked-shot"><title>Blocked shot · #${esc(event.playerNumber || "—")} · H${event.half}</title><rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="4" fill="#ffc65b" stroke="#102e29" stroke-width="3"/><text x="${x}" y="${y + 6}" text-anchor="middle" fill="#102e29" font-size="18" font-weight="bold">B</text></g>`;
        if (defensive)
          return `<g class="defensive-block-marker" data-defensive-block-id="${esc(event.id)}" data-marker-kind="defensive-block"><title>Defensive Block · #${esc(event.playerNumber || "—")} · H${event.half}</title><path d="M${x} ${y - 19}l19 19-19 19-19-19z" fill="#c5b2ff" stroke="#102e29" stroke-width="3"/><text x="${x}" y="${y + 6}" text-anchor="middle" fill="#102e29" font-size="18" font-weight="bold">D</text></g>`;
        return `<g class="shot-marker" data-shot-id="${esc(event.id)}" data-marker-kind="${type === "miss" ? "miss" : "score"}"><title>${esc(type)} · #${esc(event.playerNumber || "—")} · H${event.half}</title>${type === "miss" ? `<path d="M${x - 10} ${y - 10}l20 20m-20 0l20-20" stroke="${color}" stroke-width="6"/>` : `<circle cx="${x}" cy="${y}" r="12" fill="${color}" stroke="#102e29" stroke-width="3"/>${type === "two-point" ? `<circle cx="${x}" cy="${y}" r="19" fill="none" stroke="${color}" stroke-width="3"/>` : ""}`}</g>`;
      })
      .join("")}
  </svg>`;
}
