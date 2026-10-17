"use client";

import { useState } from "react";
import Image from "next/image";
import type { Activity } from "@/lib/types";

/**
 * Venue map with activity pins at percent coordinates. Uses the uploaded map image when the
 * event has one, otherwise a stylized floor plan (stage at top, lobby at bottom).
 * `onPlace` (admin) reports taps on the map as percent coordinates.
 */
export function VenueMap({
  activities,
  done = new Set<string>(),
  venue,
  imageUrl,
  onPlace,
  activeId,
  onActive,
}: {
  activities: Activity[];
  done?: Set<string>;
  venue: string;
  imageUrl?: string | null;
  onPlace?: (x: number, y: number) => void;
  activeId?: string | null;
  onActive?: (id: string) => void;
}) {
  const pins = activities.filter((a) => a.map_x != null && a.map_y != null);
  const [localActive, setLocalActive] = useState<string | null>(pins[0]?.id ?? null);
  const active = activeId !== undefined ? activeId : localActive;
  const setActive = (id: string) => {
    setLocalActive(id);
    onActive?.(id);
  };
  const current = pins.find((p) => p.id === active) ?? null;

  if (imageUrl) {
    return (
      <div className="bg-surface-2">
        <div
          className={`relative w-full ${onPlace ? "cursor-crosshair" : ""}`}
          onClick={(e) => {
            if (!onPlace) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPlace(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
          }}
        >
          <Image src={imageUrl} alt={`${venue} map`} width={1200} height={900} className="w-full h-auto block" unoptimized />
          {pins.map((p) => {
            const isActive = p.id === active;
            const isDone = done.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(p.id);
                }}
                aria-label={`${p.name}${p.location ? `, ${p.location}` : ""}, ${isDone ? "done" : `${p.points} points`}`}
                aria-pressed={isActive}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: `${p.map_x}%`, top: `${p.map_y}%` }}
              >
                <span className={`w-5 h-5 ${isDone ? "bg-success" : "bg-black"} ${isActive ? "ring-2 ring-white outline outline-2 outline-black" : ""} flex items-center justify-center`}>
                  {isDone && <svg viewBox="0 0 10 10" className="w-3 h-3"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" /></svg>}
                </span>
                <span className="mt-0.5 px-1 bg-black text-white text-[10px] font-bold uppercase whitespace-nowrap">{p.name}</span>
              </button>
            );
          })}
        </div>
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

  return (
    <div className="bg-surface-2">
      <svg
        viewBox="0 0 100 140"
        className={`w-full block ${onPlace ? "cursor-crosshair" : ""}`}
        role="group"
        aria-label={`${venue} floor plan`}
        onClick={(e) => {
          if (!onPlace) return;
          const r = e.currentTarget.getBoundingClientRect();
          onPlace(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }}
      >
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
              onClick={(e) => {
                e.stopPropagation();
                setActive(p.id);
              }}
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
