type BrandMarkProps = {
  size?: number;
};

/** Serif A over a hairline: the small cut of the AtomPDF imprint. */
export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <svg
      className="brand-glyph"
      width={(size * (42.3 / 48.14)).toFixed(2)}
      height={size}
      viewBox="0 0 42.3 48.14"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(21.15 3.67)">
        <path
          fill="currentColor"
          d="M-8.57 23.8V22.64H5.59V23.8ZM1.71 0 13.09 32.83H16.65V34H1.76V32.83H5.73L-2.46 7.54L-11.3 32.83H-6.84V34H-16.65V32.83H-12.64L-1.04 0Z"
        />
        <rect className="brand-glyph-rule" x="-17.48" y="39" width="34.96" height="1.8" />
      </g>
    </svg>
  );
}
