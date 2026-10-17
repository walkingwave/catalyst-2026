import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconHome = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);
export const IconMusic = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
export const IconTrophy = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
  </svg>
);
export const IconGift = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
    <path d="M12 8c-1.5-3-5-3-5-1s3 1 5 1zm0 0c1.5-3 5-3 5-1s-3 1-5 1z" />
  </svg>
);
export const IconSun = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const IconMoon = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
export const IconChevron = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const IconCheck = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);
export const IconX = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const IconNfc = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 8.5a8 8 0 0 1 0 7M9.5 10a4 4 0 0 1 0 4M18 8.5a8 8 0 0 0 0 7M14.5 10a4 4 0 0 0 0 4" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);
export const IconLogo = ({ size = 24, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...p}>
    <rect width="24" height="24" rx="7" fill="currentColor" />
    <circle cx="12" cy="12" r="4.5" fill="white" />
  </svg>
);
export const IconLock = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
export const IconPhone = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </svg>
);
export const IconUser = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const IconTicket = ({ size = 24, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5z" />
    <path d="M13 5v2M13 11v2M13 17v2" strokeDasharray="1 2" />
  </svg>
);
