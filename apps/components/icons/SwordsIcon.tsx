interface IconProps {
  className?: string;
}

export function SwordsIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="13,2 4,14 12,14 11,22 20,10 12,10 13,2" />
    </svg>
  );
}
