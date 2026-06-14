/**
 * FrenchieIcon — Pixush's mascot, a cute illustrated French bulldog face.
 *
 * Two-tone (dark body + white face mask), round expressive eyes, pink tongue.
 * Inspired by the Pixush dog tag. Designed to read at small sizes (12px+).
 */
export function FrenchieIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  // Color palette — tuned to feel warm/cute on the papaya brand
  const bodyFill = '#2A2622';      // warm near-black (neutral-800)
  const maskFill = '#FFFFFF';      // white face mask
  const pupil    = '#1A1714';      // pupils
  const highlight = '#FFFFFF';     // eye highlight dots
  const nose     = '#1A1714';
  const tongue   = '#F78BA1';      // soft pink
  const mouthStroke = '#1A1714';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {/* ── Bat ears — tall, pointed, prominent ───────────────── */}
      <path
        d="M10 18 Q5 2 13 4 Q15 10 17 19 Z"
        fill={bodyFill}
      />
      {/* inner pink ear */}
      <path d="M11.5 13 Q11 6 13.5 6.5 Q14 11 14.5 16 Z" fill={tongue} opacity="0.55" />

      <path
        d="M38 18 Q43 2 35 4 Q33 10 31 19 Z"
        fill={bodyFill}
      />
      <path d="M36.5 13 Q37 6 34.5 6.5 Q34 11 33.5 16 Z" fill={tongue} opacity="0.55" />

      {/* ── Head — wide, rounded, slightly squished ──────────── */}
      <path
        d="
          M9 20
          Q9 12 17 11
          L31 11
          Q39 12 39 20
          L39 32
          Q39 43 24 44
          Q9 43 9 32
          Z
        "
        fill={bodyFill}
      />

      {/* ── White face mask — covers muzzle, chin and brow blaze ── */}
      <path
        d="
          M18 18
          Q24 13 30 18
          L31 26
          Q33 28 33 32
          Q33 41 24 42
          Q15 41 15 32
          Q15 28 17 26
          Z
        "
        fill={maskFill}
      />

      {/* ── Eyes — big, round, expressive ─────────────────────── */}
      {/* eye whites stay dark (the dog's eyes are dark, not white) */}
      <circle cx="18.5" cy="22" r="3.6" fill={pupil} />
      <circle cx="29.5" cy="22" r="3.6" fill={pupil} />
      {/* glossy highlights */}
      <circle cx="19.8" cy="21" r="1.05" fill={highlight} />
      <circle cx="30.8" cy="21" r="1.05" fill={highlight} />
      <circle cx="17.6" cy="23.2" r="0.5" fill={highlight} opacity="0.7" />
      <circle cx="28.6" cy="23.2" r="0.5" fill={highlight} opacity="0.7" />

      {/* tiny blush cheeks for cuteness */}
      <ellipse cx="14.5" cy="30" rx="2.2" ry="1.2" fill={tongue} opacity="0.35" />
      <ellipse cx="33.5" cy="30" rx="2.2" ry="1.2" fill={tongue} opacity="0.35" />

      {/* ── Nose — chunky and centered ────────────────────────── */}
      <path
        d="M21 30 Q24 27 27 30 Q27 33 24 33 Q21 33 21 30 Z"
        fill={nose}
      />
      {/* nose highlight */}
      <circle cx="22.5" cy="29.7" r="0.6" fill={highlight} opacity="0.6" />

      {/* ── Mouth — small smile + visible tongue ──────────────── */}
      <path
        d="M19 34 Q24 37 29 34"
        stroke={mouthStroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      {/* tongue peeking out */}
      <path
        d="M22 36.5 Q24 41 26 36.5 Q25 39 24 39 Q23 39 22 36.5 Z"
        fill={tongue}
      />
    </svg>
  );
}
