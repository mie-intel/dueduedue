interface IconProps {
  className?: string;
}

export function GamepadIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Controller body */}
      <rect x="3" y="7" width="18" height="11" rx="5" />
      {/* D-pad: vertical */}
      <path d="M9.5 10.5v4" />
      {/* D-pad: horizontal */}
      <path d="M7.5 12.5h4" />
      {/* Button A */}
      <circle cx="15" cy="11" r="0.8" fill="currentColor" stroke="none" />
      {/* Button B */}
      <circle cx="16.5" cy="13" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
