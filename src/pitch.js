import { esc } from "./ui.js";
export const hasLocation = (event) =>
  Number.isFinite(event.shotX) && Number.isFinite(event.shotY);
export function pitchMarkup(events = [], interactive = false) {
  return `<svg class="gaelic-pitch ${interactive ? "interactive-pitch" : ""}" viewBox="0 0 600 900" ${interactive ? 'role="button" tabindex="0" aria-label="Shot location pitch"' : 'role="img" aria-label="Shot map, attacking goal at top"'}>
    <rect width="600" height="900" fill="#24573f"/>
    <path d="M0 150H600M0 450H600M0 750H600" stroke="#ffffff09" stroke-width="145"/>
    <g fill="none" stroke="#e2edcb" stroke-width="3" opacity=".8"><rect x="20" y="20" width="560" height="860"/><path d="M20 450H580M20 290H580M20 610H580M20 145H580M20 755H580M220 20V85H380V20M220 880V815H380V880M270 20V55H330V20M270 880V845H330V880M280 20V5M320 20V5M280 880V895M320 880V895"/><circle cx="300" cy="450" r="22"/><path d="M235 145Q300 225 365 145M235 755Q300 675 365 755"/></g>
    <text x="300" y="115" fill="#e4edc9" text-anchor="middle" font-size="17" letter-spacing="3">ATTACKING GOAL ↑</text>
    ${events
      .filter(hasLocation)
      .map((event) => {
        const x = event.shotX * 600,
          y = event.shotY * 900;
        const type = event.event;
        const color =
          type === "goal"
            ? "#e1f690"
            : type === "two-point"
              ? "#9bdcf3"
              : type === "point"
                ? "#ffffff"
                : "#ffb0a3";
        return `<g class="shot-marker" data-shot-id="${esc(event.id)}"><title>${esc(type)} · #${esc(event.playerNumber || "—")} · H${event.half}</title>${type === "miss" ? `<path d="M${x - 10} ${y - 10}l20 20m-20 0l20-20" stroke="${color}" stroke-width="6"/>` : `<circle cx="${x}" cy="${y}" r="12" fill="${color}" stroke="#102e29" stroke-width="3"/>${type === "two-point" ? `<circle cx="${x}" cy="${y}" r="19" fill="none" stroke="${color}" stroke-width="3"/>` : ""}`}</g>`;
      })
      .join("")}
  </svg>`;
}
