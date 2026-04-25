interface IconProps {
  className?: string;
}

export function CameraIcon({ className }: IconProps) {
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
      {/* Camera body */}
      <rect x="2" y="8" width="20" height="13" rx="2.5" />
      {/* Viewfinder bump */}
      <path d="M8 8V6.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V8" />
      {/* Lens outer */}
      <circle cx="12" cy="14.5" r="3.5" />
      {/* Lens inner */}
      <circle cx="12" cy="14.5" r="1.5" />
      {/* Flash indicator */}
      <circle cx="17.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
