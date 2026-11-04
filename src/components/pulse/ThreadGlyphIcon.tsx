import { formatThreadAlias, generateThreadGlyph } from '@/lib/domain/pulse-engine';

interface AliasChipWithGlyphProps {
  postId: string;
  aliasNo: number;
}

export function AliasChipWithGlyph({ postId, aliasNo }: AliasChipWithGlyphProps) {
  const glyph = generateThreadGlyph(postId, aliasNo);
  const label = formatThreadAlias(aliasNo);
  const isOp = aliasNo === 0;

  const strokeColor = glyph.variant === 'gold' ? '#8A6200' : '#0B2A5B';
  const fillColor = glyph.variant === 'gold' ? '#D9A21B' : '#0B2A5B';

  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        style={{ transform: `rotate(${glyph.rotationDeg}deg)` }}
        className="shrink-0"
      >
        {glyph.shape === 'diamond' && (
          <polygon points="8,1 15,8 8,15 1,8" fill={fillColor} />
        )}
        {glyph.shape === 'triangle' && (
          <polygon points="8,2 14,14 2,14" fill={fillColor} />
        )}
        {glyph.shape === 'square' && (
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill={fillColor} />
        )}
        {glyph.shape === 'hexagon' && (
          <polygon points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5" fill={fillColor} />
        )}
        {glyph.shape === 'circle' && (
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={strokeColor} strokeWidth="2.5" />
        )}
        {glyph.shape === 'octagon' && (
          <polygon
            points="5,1.5 11,1.5 14.5,5 14.5,11 11,14.5 5,14.5 1.5,11 1.5,5"
            fill={fillColor}
          />
        )}
      </svg>
      <span
        className={
          isOp
            ? 'inline-flex items-center px-2 py-0.5 rounded-full text-[13px] leading-[18px] font-bold bg-[#D9A21B] text-[#0B2A5B]'
            : 'inline-flex items-center px-2 py-0.5 rounded-full text-[13px] leading-[18px] font-semibold bg-[#DCE6F5] text-[#0B2A5B]'
        }
      >
        {label}
      </span>
    </span>
  );
}

