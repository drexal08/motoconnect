import React from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 32,
  className = '',
}) => {
  return (
    <img
      src="/logo-mark.png"
      alt="MotoConnect"
      width={size}
      height={size}
      className={`rounded-xl object-contain ${className}`}
    />
  );
};

interface LogoFullProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'white';
  className?: string;
}

export const LogoFull: React.FC<LogoFullProps> = ({
  size = 'md',
  variant = 'default',
  className = '',
}) => {
  const conf = {
    sm: { mark: 28, name: 'text-[14px]', sub: 'text-[7px] tracking-[0.16em]', gap: 'gap-2' },
    md: { mark: 36, name: 'text-[17px]', sub: 'text-[8px] tracking-[0.16em]', gap: 'gap-2.5' },
    lg: { mark: 46, name: 'text-[24px]', sub: 'text-[10px] tracking-[0.16em]', gap: 'gap-3' },
  };
  const s = conf[size];
  const nameColor = variant === 'white' ? 'text-white' : 'text-gray-900';
  const subColor = variant === 'white' ? 'text-white/40' : 'text-primary-700';

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <LogoMark size={s.mark} />
      <div className="flex flex-col leading-none">
        <span className={`${s.name} font-extrabold ${nameColor} tracking-[-0.02em]`}>
          MotoConnect
        </span>
        <span className={`${s.sub} font-bold ${subColor} uppercase mt-[2px]`}>
          Rwanda
        </span>
      </div>
    </div>
  );
};
