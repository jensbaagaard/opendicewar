"use client";

/**
 * Four stacked wave bands that slowly drift on independent translate loops —
 * the Codepen-style sea, dialed way down to "barely visible". Each band is a
 * single thin stroked sine-y path on its own keyframe with its own duration
 * and offset, so the lines never line up.
 *
 * Animation is GPU-cheap: only the wrapping <g> transforms move; the SVG
 * itself is static.
 */
export function WaterLayer() {
  return (
    <svg
      className="water-sea"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g className="water-band water-band-a">
        <path d="M-100 40  q50 -12 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-b">
        <path d="M-77  120 q50  16 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-c">
        <path d="M-138 200 q50 -13 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-d">
        <path d="M-65  280 q50  18 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-e">
        <path d="M-115 360 q50 -11 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-f">
        <path d="M-92  440 q50  15 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-g">
        <path d="M-148 520 q50 -14 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-h">
        <path d="M-72  600 q50  17 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-i">
        <path d="M-128 670 q50 -12 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-j">
        <path d="M-58  730 q50  14 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
      <g className="water-band water-band-k">
        <path d="M-105 780 q50 -10 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" />
      </g>
    </svg>
  );
}
