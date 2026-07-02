import React from 'react';

interface SocialLoginButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const SocialLoginButton: React.FC<SocialLoginButtonProps> = ({ label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center justify-center gap-2.5 bg-surface-secondary hover:bg-[#eef0f4] border border-[#eceef3] text-gray-700 font-semibold py-2.5 rounded-xl transition-all text-[13px] active:scale-[0.99]"
  >
    {icon}
    {label}
  </button>
);

export default SocialLoginButton;
