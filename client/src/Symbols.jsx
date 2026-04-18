export function Sistrum({ size = 48, color = "#D4884A", className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 52" className={className}>
      <path d="M 14 38 L 14 18 C 14 8, 34 8, 34 18 L 34 38" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="16" y1="18" x2="32" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="15" y1="23" x2="33" y2="23" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14.5" y1="28" x2="33.5" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
      <path d="M 20 16 L 20 32 L 31 24 Z" fill={color} opacity="0.12" />
      <line x1="24" y1="38" x2="24" y2="48" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="48" x2="28" y2="48" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShenRing({ size = 24, color = "#C8C2B4", filled = false, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="10" r="7.5" stroke={color} strokeWidth="1.5" fill={filled ? color : "none"} opacity={filled ? 0.15 : 1} />
      <line x1="7" y1="18" x2="17" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="17" x2="7" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17" y1="17" x2="17" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {filled ? (
        <path d="M 9 10 L 11 12.5 L 15.5 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <>
          <line x1="12" y1="7" x2="12" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="10" x2="15" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Scarab({ size = 20, color = "#D4884A", className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className}>
      <path d="M 10 3 C 14 3, 16 7, 16 10 C 16 14, 13 17, 10 17 C 7 17, 4 14, 4 10 C 4 7, 6 3, 10 3 Z" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1="5" x2="10" y2="15" stroke={color} strokeWidth="1" opacity="0.5" />
      <path d="M 4 10 L 1 7 M 16 10 L 19 7" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M 5 8 L 2 5 M 15 8 L 18 5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.6" fill="none" />
    </svg>
  );
}
