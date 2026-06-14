/**
 * FrenchieIcon — Pixush's mascot, a French bulldog face in a clean "robot" line-style.
 * Bat ears, round head, big eyes, flat snout. Uses currentColor so it inherits text color.
 */
export function FrenchieIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* bat ears */}
      <path d="M7.5 5.5 L5.5 13.5 L11 11" />
      <path d="M24.5 5.5 L26.5 13.5 L21 11" />
      {/* head — rounded square, wide */}
      <path d="M7 13 Q7 9 11 8.5 L21 8.5 Q25 9 25 13 L25 20 Q25 26 19 26.5 L13 26.5 Q7 26 7 20 Z" />
      {/* eyes — big and round, robot-style with inner dot */}
      <circle cx="12" cy="16" r="2.2" />
      <circle cx="20" cy="16" r="2.2" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" />
      <circle cx="20" cy="16" r="0.6" fill="currentColor" />
      {/* brow wrinkle line between eyes */}
      <path d="M16 14 L16 18" strokeWidth={1.2} />
      {/* flat snout */}
      <path d="M13.5 20.5 Q13 22.5 14.5 23 L17.5 23 Q19 22.5 18.5 20.5" />
      {/* nose */}
      <circle cx="16" cy="20.5" r="0.7" fill="currentColor" />
      {/* mouth */}
      <path d="M14.5 23.5 Q16 24.5 17.5 23.5" />
    </svg>
  );
}
