"use client";

import { useState } from "react";
import type { Activity } from "@/lib/types";

/** Monochrome floor plan (stage at top, lobby at bottom) with activity pins. Percent coordinates. */
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
    <div className="bg-surface-2">
      <svg viewBox="0 0 100 140" className="w-full block" role="group" aria-label={`${venue} floor plan`}>
        {/* stage */}
        <path d="M20 6 h60 v16 q-30 9 -60 0z" className="fill-ink" />
        <text x="50" y="16" textAnchor="middle" fontSize="4.5" fontWeight="700" letterSpacing="0.5" className="fill-surface">
          STAGE
        </text>
        {/* seating */}
        {Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d={`M16 ${34 + i * 5.5} q34 ${4 + i * 0.4} 68 0`}
            className="stroke-line-soft"
            strokeWidth="2.2"
            fill="none"
          />
        ))}
        {/* balconies */}
        <rect x="6" y="28" width="5" height="58" className="fill-line-soft" />
        <rect x="89" y="28" width="5" height="58" className="fill-line-soft" />
        {/* lobby */}
        <rect x="8" y="94" width="84" height="38" className="fill-surface" />
        <text x="50" y="104" textAnchor="middle" fontSize="4" fontWeight="700" letterSpacing="0.5" className="fill-ink-3">
          LOBBY
        </text>
        {/* doors */}
        <rect x="42" y="131.5" width="16" height="3" className="fill-ink" />
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
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(p.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`${p.name}${p.location ? `, ${p.location}` : ""}, ${isDone ? "done" : `${p.points} points`}`}
              className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-ink"
            >
              {isActive && <rect x="-5.5" y="-5.5" width="11" height="11" className="fill-none stroke-ink" strokeWidth="0.8" />}
              <rect
                x="-3.5"
                y="-3.5"
                width="7"
                height="7"
                className={isDone ? "fill-success" : "fill-ink"}
              />
              {isDone && (
                <path d="M-1.8 0 l1.3 1.3 l2.4 -2.6" stroke="white" strokeWidth="1.1" fill="none" strokeLinecap="round" />
              )}
              <text
                y="9.5"
                textAnchor="middle"
                fontSize="3.6"
                fontWeight="700"
                className="fill-ink pointer-events-none"
                style={{ textTransform: "uppercase" }}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      {current && (
        <div className="px-4 py-3 flex items-center border-t border-line-soft">
          <div className="flex-1 min-w-0">
            <p className="display d-sm truncate">{current.name}</p>
            <p className="t-foot text-ink-2 truncate mt-1">{current.location ?? venue}</p>
          </div>
          <span className={`display d-md t-num ml-3 ${done.has(current.id) ? "text-success" : ""}`}>
            {done.has(current.id) ? "Done" : `+${current.points}`}
          </span>
        </div>
      )}
    </div>
  );
}
