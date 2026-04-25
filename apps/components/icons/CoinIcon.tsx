interface IconProps {
  className?: string;
}

export function CoinIcon({ className }: IconProps) {
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
      {/* Coin body */}
      <circle cx="12" cy="12" r="8.5" />
      {/* Inner ring (depth) */}
      <circle cx="12" cy="12" r="6.5" />
      {/* "C" arc — Celo cUSD symbol */}
      <path d="M14.5 9.5c-1-.7-2.3-1-3.5-.5A4 4 0 0 0 8.5 12a4 4 0 0 0 2.5 3.7c1.2.5 2.5.2 3.5-.5" />
    </svg>
  );
}
