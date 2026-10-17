"use client";

import { useState } from "react";
import type { Activity } from "@/lib/types";

/**
 * Stylized floor plan (stage at top, lobby at bottom) with activity pins.
 * Pins use percent coordinates so the same data works at any size.
 */
export function VenueMap({
  activities,
  done = new Set<string>(),
  venue,
}: {
  activities: Activity[];
  done?: Set<string>;
  venue: string;
}) {
  const pins = activities.filter((a) => a.map_x != null && a.map_y != null);
  const [active, setActive] = useState<string | null>(pins[0]?.id ?? null);
  const current = pins.find((p) => p.id === active) ?? null;

  return (
    <div>
      <div className="relative rounded-[16px] overflow-hidden bg-surface card-shadow">
        <svg viewBox="0 0 100 140" className="w-full block" role="img" aria-label={`${venue} floor plan`}>
          {/* floor */}
          <rect x="4" y="4" width="92" height="132" rx="6" className="fill-surface-2" />
          {/* stage */}
          <path d="M22 8 h56 a3 3 0 0 1 3 3 v14 q-31 10 -62 0 v-14 a3 3 0 0 1 3 -3z" className="fill-text-3" />
          <text x="50" y="18" textAnchor="middle" fontSize="4.5" fontWeight="600" className="fill-surface">
            STAGE
          </text>
          {/* orchestra seating rows */}
          {Array.from({ length: 9 }).map((_, i) => (
            <path
              key={i}
              d={`M16 ${36 + i * 5.5} q34 ${4 + i * 0.4} 68 0`}
              className="stroke-separator"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {/* side balconies */}
          <rect x="6" y="30" width="6" height="56" rx="2" className="fill-separator" opacity="0.6" />
          <rect x="88" y="30" width="6" height="56" rx="2" className="fill-separator" opacity="0.6" />
          {/* lobby */}
          <rect x="8" y="94" width="84" height="38" rx="4" className="fill-surface" />
          <text x="50" y="104" textAnchor="middle" fontSize="4" fontWeight="600" className="fill-text-3">
            LOBBY
          </text>
          {/* doors */}
          <rect x="42" y="131" width="16" height="4" rx="1" className="fill-text-3" />
          {/* pins */}
          {pins.map((p) => {
            const isActive = p.id === active;
            const isDone = done.has(p.id);
            const x = (p.map_x! / 100) * 100;
            const y = (p.map_y! / 100) * 140;
            return (
              <g
                key={p.id}
                transform={`translate(${x} ${y})`}
                onClick={() => setActive(p.id)}
                className="cursor-pointer"
              >
                <circle r="7" className={isActive ? "fill-accent" : "fill-surface"} opacity={isActive ? 0.18 : 0} />
                <circle
                  r="4.2"
                  className={isDone ? "fill-success" : isActive ? "fill-accent" : "fill-surface"}
                  stroke="currentColor"
                  strokeWidth="1.2"
                  style={{ color: isDone ? "var(--success)" : "var(--accent)" }}
                />
                {isDone && (
                  <path d="M-1.8 0 l1.3 1.3 l2.4 -2.6" stroke="white" strokeWidth="1.1" fill="none" strokeLinecap="round" />
                )}
                <text
                  y="9.5"
                  textAnchor="middle"
                  fontSize="3.6"
                  fontWeight="600"
                  className="fill-text pointer-events-none"
                >
                  {p.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {current && (
        <div className="mt-3 rounded-[12px] bg-surface card-shadow px-4 py-3 flex items-center">
          <div className="flex-1 min-w-0">
            <p className="t-headline truncate">{current.name}</p>
            <p className="t-footnote text-text-2 truncate">{current.location ?? venue}</p>
          </div>
          <span className={`t-subhead font-semibold ml-3 ${done.has(current.id) ? "text-success" : "text-accent"}`}>
            {done.has(current.id) ? "Done" : `+${current.points}`}
          </span>
        </div>
      )}
    </div>
  );
}
