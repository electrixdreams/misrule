import { useRef } from "react";
import { stations, type StationId } from "@/lib/misrule-state";
import type { WorldPack } from "@/lib/world-pack";

type Props = {
  pack: WorldPack;
  sourceLabel: string;
  selectedStation: StationId;
  handAngle: number;
  auditStatus: "dormant" | "running" | "complete" | "blocked";
  topology: "none" | "closed" | "open";
  quieted: boolean;
  running: boolean;
  auditMode: "live" | "mock";
  onStation: (station: StationId) => void;
  onAudit: () => void;
};

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

  return (
    <section className="instrument-stage" data-quieted={props.quieted || undefined} aria-label="Clockwork archive navigation">
      <div className="instrument" data-audit={props.auditStatus} data-topology={props.topology}>
        <svg className="instrument-svg" viewBox="0 0 700 700" role="img" aria-labelledby="clockwork-title clockwork-description">
          <title id="clockwork-title">{props.pack.title} as Misrule&apos;s literary reasoning instrument</title>
          <desc id="clockwork-description">Three rings show world navigation, audit state, and selected finding topology for the active {props.sourceLabel.toLowerCase()}. One brass hand aligns to the selected station.</desc>
          <defs>
            <radialGradient id="misrule-glow"><stop offset="0" stopColor="#b8d9d6" stopOpacity=".15" /><stop offset="1" stopColor="#070a0b" stopOpacity="0" /></radialGradient>
            <linearGradient id="misrule-brass" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#ead08c" /><stop offset=".45" stopColor="#6f4d2d" /><stop offset="1" stopColor="#c89550" /></linearGradient>
          </defs>
          <circle cx="350" cy="350" r="328" fill="url(#misrule-glow)" />
          <g className="ring ring--navigation" fill="none">
            <circle cx="350" cy="350" r="302" stroke="url(#misrule-brass)" strokeWidth="4" />
            {[[350,48],[63,257],[637,257],[117,540],[583,540]].map(([cx,cy], index) => <circle key={index} cx={cx} cy={cy} r="7" fill="#b98b4a" stroke="#ead08c" />)}
          </g>
          <g className="ring ring--audit" fill="none">
            <circle cx="350" cy="350" r="254" stroke="#344746" strokeWidth="12" />
            <path className="audit-arc" d="M350 96 A254 254 0 1 1 169 171" stroke="#b8d9d6" strokeWidth="12" strokeLinecap="round" />
          </g>
          <g className="ring ring--path" fill="none">
            <circle cx="350" cy="350" r="202" stroke="#805d35" strokeWidth="2" />
            <path className="fracture-route" d="M197 375 C235 291 291 239 350 235 C425 230 489 289 503 374 C481 445 425 488 350 492 C282 494 221 451 197 375 Z" stroke="#ef7964" strokeWidth="5" strokeLinecap="round" />
            <path className="open-route" d="M205 397 C245 307 289 271 332 261 M495 397 C455 307 411 271 368 261" stroke="#d4c6ff" strokeWidth="4" strokeLinecap="round" />
            <g className="missing-pin"><circle cx="350" cy="253" r="29" fill="#0c1213" stroke="#d4c6ff" strokeWidth="3" /><circle cx="350" cy="253" r="12" fill="none" stroke="#d4c6ff" strokeWidth="2" strokeDasharray="4 5" /></g>
          </g>
          <g className="tower" aria-hidden="true">
            <path d="M244 550H456L442 248L403 204L391 139H309L297 204L258 248Z" fill="#101718" stroke="#c29351" strokeWidth="4" />
            <path d="M311 139L350 82L389 139Z" fill="#11191a" stroke="#c29351" strokeWidth="4" />
            <path d="M350 82V50M258 248H442M244 550H456" stroke="#e0bc72" strokeWidth="3" opacity=".68" />
            <circle cx="350" cy="205" r="56" fill="#111819" stroke="#dfbf76" strokeWidth="4" />
            <circle cx="350" cy="205" r="42" fill="none" stroke="#a8d1cd" strokeWidth="2" opacity=".55" />
            <path d="M350 205V174M350 205L377 220" stroke="#f0cf82" strokeWidth="4" strokeLinecap="round" />
            <circle cx="350" cy="205" r="6" fill="#e8c77b" />
            <rect className="tower-window" x="288" y="286" width="45" height="70" rx="22" />
            <rect className="tower-window" x="367" y="286" width="45" height="70" rx="22" />
            <rect className="tower-window" x="288" y="382" width="45" height="70" rx="22" />
            <rect className="tower-window" x="367" y="382" width="45" height="70" rx="22" />
            <path d="M325 550V480C325 451 375 451 375 480V550Z" fill="#071011" stroke="#937043" strokeWidth="3" />
          </g>
          <g className="brass-hand" style={{ transform: `rotate(${props.handAngle}deg)` }} stroke="#f0cf82" strokeWidth="4" fill="none">
            <path d="M350 350L350 72" /><circle cx="350" cy="350" r="11" fill="#111718" stroke="#f0cf82" strokeWidth="3" /><path d="M350 60l-9 22h18z" fill="#f0cf82" stroke="none" />
          </g>
        </svg>

        <nav className="station-nav" aria-label="Archive stations" onKeyDown={onStationKeyDown}>
          {stations.map((station, index) => (
            <button
              key={station.id}
              className={`station station--${station.id}`}
              type="button"
              aria-label={`${station.primary} ${station.secondary}`}
              aria-current={props.selectedStation === station.id ? "page" : undefined}
              tabIndex={props.selectedStation === station.id ? 0 : -1}
              ref={(element) => { buttonRefs.current[index] = element; }}
              onClick={() => props.onStation(station.id)}
            >
              <i aria-hidden="true" /><span>{station.primary}</span><small>{station.secondary}</small>
            </button>
          ))}
        </nav>

        <div className="instrument-title">
          <small>Inspectable fictional-world rule audit</small>
          <h1>Misrule</h1>
          <p>Find where the world turns against itself.</p>
          <span>{props.pack.world.title} · {stations.find((station) => station.id === props.selectedStation)!.primary} · {stations.find((station) => station.id === props.selectedStation)!.secondary}</span>
        </div>

        <button className="wind-key" type="button" onClick={props.onAudit} disabled={props.running}>
          <span>{props.running ? "Auditing paths" : "Set the world in motion"}</span>
          <small>{props.running ? "Indeterminate · awaiting one server response" : props.auditMode === "mock" ? "Deterministic mock gateway · not live" : `Audit ${props.sourceLabel.toLowerCase()}`}</small>
        </button>
      </div>
    </section>
  );
}
