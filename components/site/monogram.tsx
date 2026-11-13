/** The VeilCode "VC" monogram from public/brand/veilcode-mark.svg, without its tile, drawn in currentColor. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path d="m12 21 10 22 10-22M51 24a10 10 0 1 0 0 16" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
