import React from 'react';

export const ImigongoDivider: React.FC<{
  className?: string;
  color?: string;
  opacity?: number;
}> = ({ className = '', color = 'currentColor', opacity = 0.08 }) => (
  <div className={`w-full overflow-hidden ${className}`}>
    <svg width="100%" height="20" viewBox="0 0 600 20" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
      {Array.from({ length: 25 }).map((_, i) => (
        <g key={i} opacity={opacity}>
          <path
            d={`M${i * 24 + 12} 2 L${i * 24 + 22} 10 L${i * 24 + 12} 18 L${i * 24 + 2} 10 Z`}
            stroke={color}
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d={`M${i * 24 + 12} 5 L${i * 24 + 18} 10 L${i * 24 + 12} 15 L${i * 24 + 6} 10 Z`}
            fill={color}
            opacity="0.4"
          />
        </g>
      ))}
    </svg>
  </div>
);

export const ImigongoBackground: React.FC<{
  className?: string;
  color?: string;
  opacity?: number;
}> = ({ className = '', color = '#1c3f94', opacity = 0.03 }) => (
  <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="imigongo-bg" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M30 4 L56 30 L30 56 L4 30 Z" stroke={color} strokeWidth="1" fill="none" opacity={opacity * 12} />
          <path d="M30 12 L48 30 L30 48 L12 30 Z" stroke={color} strokeWidth="0.8" fill="none" opacity={opacity * 8} />
          <path d="M30 20 L40 30 L30 40 L20 30 Z" fill={color} opacity={opacity * 5} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#imigongo-bg)" />
    </svg>
  </div>
);

export const ImigongoCorner: React.FC<{
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: number;
  color?: string;
  opacity?: number;
}> = ({ position, size = 40, color = 'currentColor', opacity = 0.1 }) => {
  const transforms: Record<string, string> = {
    'top-left': '',
    'top-right': `translate(${size}, 0) scale(-1, 1)`,
    'bottom-left': `translate(0, ${size}) scale(1, -1)`,
    'bottom-right': `translate(${size}, ${size}) scale(-1, -1)`,
  };
  const positions: Record<string, string> = {
    'top-left': 'top-0 left-0',
    'top-right': 'top-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'bottom-right': 'bottom-0 right-0',
  };

  return (
    <div className={`absolute ${positions[position]} pointer-events-none`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform={transforms[position]}>
          <path d={`M0 0 L${size} 0 L0 ${size} Z`} fill={color} opacity={opacity * 0.3} />
          <path d={`M0 0 L${size * 0.7} 0 L0 ${size * 0.7} Z`} fill={color} opacity={opacity * 0.5} />
          <path d={`M0 0 L${size * 0.4} 0 L0 ${size * 0.4} Z`} fill={color} opacity={opacity * 0.8} />
          <path d={`M${size * 0.15} ${size * 0.08} L${size * 0.25} ${size * 0.18} L${size * 0.15} ${size * 0.28} L${size * 0.05} ${size * 0.18} Z`} fill={color} opacity={opacity} />
        </g>
      </svg>
    </div>
  );
};

export const ImigongoBar: React.FC<{
  className?: string;
  color?: string;
  height?: number;
}> = ({ className = '', color = '#1c3f94', height = 6 }) => (
  <div className={`w-full ${className}`}>
    <svg width="100%" height={height} viewBox="0 0 800 6" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d={`M0 6 ${Array.from({ length: 80 }).map((_, i) => `L${i * 10 + 5} 0 L${i * 10 + 10} 6`).join(' ')}`}
        fill={color}
        opacity="0.07"
      />
      <path
        d={`M0 6 ${Array.from({ length: 80 }).map((_, i) => `L${i * 10 + 5} 2 L${i * 10 + 10} 6`).join(' ')}`}
        fill={color}
        opacity="0.04"
      />
    </svg>
  </div>
);

export const ImigongoMotif: React.FC<{
  size?: number;
  className?: string;
  color?: string;
}> = ({ size = 24, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke={color} strokeWidth="1" opacity="0.15" />
    <path d="M12 6 L18 12 L12 18 L6 12 Z" stroke={color} strokeWidth="0.8" opacity="0.2" />
    <path d="M12 9 L15 12 L12 15 L9 12 Z" fill={color} opacity="0.12" />
  </svg>
);
