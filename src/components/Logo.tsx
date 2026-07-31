import { Bike, MapPin, Radio } from 'lucide-react';
import React from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
  variant?: 'dark' | 'light';
}

export const LogoMark: React.FC<LogoMarkProps> = ({ size = 36, className = '', variant = 'dark' }) => {
  const text = variant === 'light' ? 'text-white' : 'text-emerald-900';
  const accent = variant === 'light' ? 'text-amber-300' : 'text-amber-500';
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <div className={`absolute inset-0 rounded-2xl ${variant === 'light' ? 'bg-white/10' : 'bg-emerald-900'} shadow-lg`} />
      <div className="relative z-10 flex items-center gap-0.5">
        <Bike size={size * 0.55} strokeWidth={2.4} className={text} />
        <div className="relative -ml-0.5 -mt-1">
          <MapPin size={size * 0.28} strokeWidth={2.2} className={`${accent} drop-shadow-sm`} />
          <Radio size={size * 0.16} strokeWidth={2.4} className={`${text} absolute -top-0.5 -right-0.5`} />
        </div>
      </div>
    </div>
  );
};

interface LogoFullProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
  className?: string;
}

export const LogoFull: React.FC<LogoFullProps> = ({ size = 'md', variant = 'dark', className = '' }) => {
  const conf = {
    sm: { mark: 28, name: 'text-[16px]', sub: 'text-[9px]', gap: 'gap-2' },
    md: { mark: 40, name: 'text-[22px]', sub: 'text-[10px]', gap: 'gap-2.5' },
    lg: { mark: 52, name: 'text-[30px]', sub: 'text-[11px]', gap: 'gap-3' },
  };
  const s = conf[size];
  const nameColor = variant === 'light' ? 'text-white' : 'text-emerald-950';
  const subColor = variant === 'light' ? 'text-white/50' : 'text-amber-600';
  return (
    <a href="/" className={`flex items-center ${s.gap} ${className} group`} aria-label="MotoConnect home">
      <LogoMark size={s.mark} variant={variant} />
      <div className="flex flex-col leading-none">
        <span className={`${s.name} font-extrabold ${nameColor} tracking-[-0.03em] leading-tight`}>
          MotoConnect
        </span>
        <span className={`${s.sub} font-bold ${subColor} uppercase tracking-[0.15em] mt-[3px]`}>
          Rwanda
        </span>
      </div>
    </a>
  );
};
