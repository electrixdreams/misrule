import { useRef } from "react";
import { stations, type StationId } from "@/lib/misrule-state";
import type { WorldPack } from "@/lib/world-pack";

type Props = {
  pack: WorldPack;
  sourceLabel: string;
  selectedStation: StationId;
  auditStatus: "dormant" | "running" | "complete" | "blocked";
  topology: "none" | "closed" | "open";
  quieted: boolean;
  running: boolean;
  auditMode: "live" | "mock";
  onStation: (station: StationId) => void;
  onAudit: () => void;
};

// Coordinate space for the route board's SVG and the station buttons laid
// over it, in a fixed 3:4 unit box (matches .route-board's aspect-ratio) —
// the single source of truth for both, so the clickable waypoint and its
// drawn pin can never drift apart.
const BOX_W = 300;
const BOX_H = 400;

const ROUTE_WAYPOINTS: Record<"world" | "rules" | "record" | "findings", { x: number; y: number }> = {
  world: { x: 150, y: 55 },
  rules: { x: 225, y: 160 },
  record: { x: 85, y: 250 },
  findings: { x: 215, y: 340 },
};

const ROUTE_PATH = "M150,55 C210,80 225,110 225,160 C225,205 110,215 85,250 C60,285 190,300 215,340";

function pct(value: number, dimension: number) {
  return `${((value / dimension) * 100).toFixed(2)}%`;
}

export function ClockworkInstrument(props: Props) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  function onStationKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const current = buttonRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
    const next = (current + delta + stations.length) % stations.length;
    props.onStation(stations[next].id);
    buttonRefs.current[next]?.focus();
  }

  const currentStation = stations.find((station) => station.id === props.selectedStation)!;

  return (
    <section className="instrument-stage" data-quieted={props.quieted || undefined} aria-label="Clockwork archive navigation">
      <div className="instrument" data-audit={props.auditStatus} data-topology={props.topology}>
        <header className="instrument-heading">
          <small>Inspectable fictional-world rule audit</small>
          <h1>Misrule</h1>
          <p>Find where the world turns against itself.</p>
        </header>

        <div className="route-board">
          <svg
            className="route-svg"
            viewBox={`0 0 ${BOX_W} ${BOX_H}`}
            role="img"
            aria-labelledby="clockwork-title clockwork-description"
          >
            <title id="clockwork-title">{props.pack.title} as Misrule&apos;s literary reasoning instrument</title>
            <desc id="clockwork-description">
              A route connects the world, rules, record, and findings stations of the active {props.sourceLabel.toLowerCase()}.
              The route glows while an audit is under way, and the current station is lit.
            </desc>

            <path className="route-line" d={ROUTE_PATH} fill="none" pathLength={300} />
            <path className="route-line--glow" d={ROUTE_PATH} fill="none" pathLength={300} />

            {props.topology !== "none" ? (
              <g
                className={`topology-sigil topology-sigil--${props.topology}`}
                transform={`translate(${ROUTE_WAYPOINTS.findings.x} ${ROUTE_WAYPOINTS.findings.y})`}
                aria-hidden="true"
              >
                <circle r="22" />
                {props.topology === "open" ? <circle className="topology-missing-mark" r="5" cx="16" cy="-16" /> : null}
              </g>
            ) : null}
          </svg>

          <nav className="station-nav" aria-label="Archive stations" onKeyDown={onStationKeyDown}>
            {stations.map((station, index) => {
              const isColophon = station.id === "method";
              const waypoint = isColophon ? null : ROUTE_WAYPOINTS[station.id as keyof typeof ROUTE_WAYPOINTS];
              return (
                <button
                  key={station.id}
                  className={`station station--${station.id}${isColophon ? " station--colophon" : ""}`}
                  type="button"
                  style={waypoint ? { top: pct(waypoint.y, BOX_H), left: pct(waypoint.x, BOX_W) } : undefined}
                  aria-label={`${station.primary} ${station.secondary}`}
                  aria-current={props.selectedStation === station.id ? "page" : undefined}
                  tabIndex={props.selectedStation === station.id ? 0 : -1}
                  ref={(element) => { buttonRefs.current[index] = element; }}
                  onClick={() => props.onStation(station.id)}
                >
                  <i aria-hidden="true" /><span>{station.primary}</span><small>{station.secondary}</small>
                </button>
              );
            })}
          </nav>
        </div>

        <p className="instrument-caption">{props.pack.world.title} · {currentStation.primary} · {currentStation.secondary}</p>

        <button className="wind-key" type="button" onClick={props.onAudit} disabled={props.running}>
          <span>{props.running ? "Auditing paths" : "Set the world in motion"}</span>
          <small>{props.running ? "Indeterminate · awaiting one server response" : props.auditMode === "mock" ? "Deterministic mock gateway · not live" : `Audit ${props.sourceLabel.toLowerCase()}`}</small>
        </button>
      </div>
    </section>
  );
}
