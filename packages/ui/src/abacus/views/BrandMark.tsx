/** The abacus mark: a framed square crossed by three rails and two rods. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="currentColor" />
      <path
        d="M7 8.5h18M7 16h18M7 23.5h18M11 5v22M21 5v22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
