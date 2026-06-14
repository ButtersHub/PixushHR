import pixushMascot from '../../assets/brand/pixush-favicon-64.png';

/**
 * FrenchieIcon — Pixush's mascot for compact badges and filters.
 */
export function FrenchieIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={pixushMascot}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
