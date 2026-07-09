/** Claude 风星芒 logo（与 app/icon.svg 同形）：珊瑚陶土色射线。 */
export function BrandMark({ size = 20 }: { size?: number }) {
  const rays: Array<[number, number]> = [
    [32, 12],
    [42.4, 14.9],
    [49.1, 21.6],
    [52, 32],
    [49.1, 42.4],
    [42.4, 49.1],
    [32, 52],
    [21.6, 49.1],
    [14.9, 42.4],
    [12, 32],
    [14.9, 21.6],
    [21.6, 14.9]
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="5.2" strokeLinecap="round">
        {rays.map(([x, y]) => (
          <line key={`${x}-${y}`} x1="32" y1="32" x2={x} y2={y} />
        ))}
      </g>
    </svg>
  );
}
