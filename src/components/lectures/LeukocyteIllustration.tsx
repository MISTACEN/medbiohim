"use client";

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  cell:
    | "neutrophils"
    | "lymphocytes"
    | "monocytes"
    | "eosinophils"
    | "basophils";
  variant?: 0 | 1;
};

const pick = (variant: number | undefined, first: number, second: number) =>
  (variant ?? 0) % 2 === 0 ? first : second;

function Granules({
  count,
  color,
  opacity = 0.72,
  seed = 0,
  radius = 2.2,
}: {
  count: number;
  color: string;
  opacity?: number;
  seed?: number;
  radius?: number;
}) {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = ((index * 137.5 + seed * 29) % 360) * (Math.PI / 180);
    const ring = 15 + ((index * 17 + seed * 11) % 25);
    const jitter = ((index * 7 + seed * 3) % 9) - 4;
    return {
      x: 120 + Math.cos(angle) * (ring + jitter),
      y: 90 + Math.sin(angle) * (ring * 0.86 + jitter),
      r: radius * (0.75 + ((index + seed) % 4) * 0.13),
    };
  });

  return (
    <g opacity={opacity}>
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={point.r} fill={color} />
      ))}
    </g>
  );
}

function Background({
  cytoplasm,
  rim = "#e9d5e5",
}: {
  cytoplasm: string;
  rim?: string;
}) {
  return (
    <>
      <circle cx="120" cy="90" r="55" fill="#f7e7e6" stroke={rim} strokeWidth="3" />
      <circle cx="120" cy="90" r="49" fill={cytoplasm} opacity="0.96" />
    </>
  );
}

export function LeukocyteIllustration({ cell, variant = 0, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 240 180"
      role="img"
      aria-label="Учебный рисунок одной клетки крови"
      {...props}
    >
      <rect x="0" y="0" width="240" height="180" rx="24" fill="#fff" />
      <Background cytoplasm="#f8edf3" rim="#e7d9e7" />

      {cell === "neutrophils" ? (
        <>
          <g fill="#8f4ea2">
            <ellipse cx={pick(variant, 91, 95)} cy="69" rx="17" ry="21" />
            <ellipse cx={pick(variant, 119, 124)} cy={pick(variant, 59, 62)} rx="16" ry="21" />
            <ellipse cx={pick(variant, 148, 143)} cy="70" rx="17" ry="21" />
            <path
              d={
                variant % 2 === 0
                  ? "M101 70 C108 69 111 63 116 61 M134 61 C139 65 141 70 147 70"
                  : "M101 70 C110 72 113 63 120 62 M134 62 C138 65 140 70 144 71"
              }
              stroke="#8f4ea2"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          <Granules count={34} color="#a77aa9" opacity={0.78} seed={variant + 2} radius={1.7} />
          <circle cx="120" cy="90" r="55" fill="none" stroke="#cfb2ca" strokeWidth="2" />
        </>
      ) : null}

      {cell === "lymphocytes" ? (
        <>
          <circle cx="120" cy={pick(variant, 89, 91)} r="39" fill="#684394" />
          <circle cx="112" cy={pick(variant, 86, 90)} r="31" fill="#5e3c88" opacity="0.88" />
          <ellipse
            cx={pick(variant, 88, 150)}
            cy={pick(variant, 94, 86)}
            rx="10"
            ry="7"
            fill="#8d63ac"
            opacity="0.36"
          />
          <path
            d="M81 126 C91 135 105 139 120 140 C137 141 151 134 160 124"
            stroke="#7b4a9d"
            strokeWidth="3"
            opacity="0.75"
            fill="none"
          />
        </>
      ) : null}

      {cell === "monocytes" ? (
        <>
          <path
            d={
              variant % 2 === 0
                ? "M87 72 C91 46 118 42 145 52 C162 59 164 78 153 98 C145 113 128 128 109 125 C92 122 82 106 84 91 C85 84 85 78 87 72 Z"
                : "M92 60 C104 45 131 44 151 58 C166 69 159 93 149 106 C135 125 113 131 98 118 C84 106 81 81 92 60 Z"
            }
            fill="#8e68a4"
          />
          <path
            d={
              variant % 2 === 0
                ? "M91 83 C99 65 119 58 137 67 C151 74 145 92 136 102 C124 116 109 118 98 107 C90 99 88 91 91 83 Z"
                : "M94 74 C108 58 130 59 143 72 C153 83 145 99 132 107 C117 116 101 109 94 97 C88 88 88 81 94 74 Z"
            }
            fill="#5c447f"
          />
          <Granules count={12} color="#a58aaf" opacity={0.38} seed={variant + 8} radius={2.4} />
        </>
      ) : null}

      {cell === "eosinophils" ? (
        <>
          <g fill="#a65f99">
            <ellipse cx={pick(variant, 100, 101)} cy={pick(variant, 86, 88)} rx="20" ry="25" />
            <ellipse cx={pick(variant, 140, 138)} cy={pick(variant, 94, 91)} rx="20" ry="25" />
            <path d="M116 78 C120 77 124 80 125 83" stroke="#a65f99" strokeWidth="8" strokeLinecap="round" />
          </g>
          <Granules count={46} color={pick(variant, "#d84f43", "#e0644f")} opacity={0.86} seed={variant + 3} radius={2.8} />
        </>
      ) : null}

      {cell === "basophils" ? (
        <>
          <path
            d={
              variant % 2 === 0
                ? "M90 72 C99 55 113 52 122 66 C131 51 147 55 152 70 C157 84 146 96 134 101 C147 112 137 128 122 123 C108 132 96 119 103 107 C88 100 84 85 90 72 Z"
                : "M95 65 C106 55 118 60 122 72 C129 55 145 59 150 73 C155 88 143 98 133 102 C143 113 134 128 120 121 C106 129 96 116 102 106 C88 97 87 78 95 65 Z"
            }
            fill="#6f427f"
            opacity="0.92"
          />
          <Granules count={60} color="#5b2f72" opacity={0.95} seed={variant + 12} radius={3.2} />
          <Granules count={24} color="#8e3e78" opacity={0.78} seed={variant + 20} radius={1.9} />
        </>
      ) : null}
    </svg>
  );
}

export default LeukocyteIllustration;
