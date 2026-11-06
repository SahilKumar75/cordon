const shapes = {
  sealed: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  unsealed: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5 7V5a3 3 0 0 1 5.8-1" />
    </>
  ),
  check: <path d="M3 8.5l3 3 7-7" />,
  blocked: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 11.9l7.8-7.8" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2l6.5 11.5h-13z" />
      <path d="M8 6.5v3M8 11.5v.01" />
    </>
  ),
  pending: <circle cx="8" cy="8" r="5.5" strokeDasharray="2 2.3" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.5" />
    </>
  ),
  external: <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" />,
  flask: <path d="M6 2h4M6.5 2v4L3 13.5h10L9.5 6V2M4.6 10.5h6.8" />,
  replay: <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" />,
  wallet: (
    <>
      <rect x="2" y="4" width="12" height="9" rx="1" />
      <path d="M10 8.5h2" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.5V11M8 5v.01" />
    </>
  ),
  pkg: (
    <>
      <path d="M2.5 5L8 2.5 13.5 5v6L8 13.5 2.5 11z" />
      <path d="M2.5 5L8 7.5 13.5 5M8 7.5v6" />
    </>
  ),
  shield: (
    <>
      <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" />
      <path d="M8 5.5v3M8 10.5v.01" />
    </>
  ),
  link: <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />,
};

export type IconName = keyof typeof shapes;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {shapes[name]}
    </svg>
  );
}
