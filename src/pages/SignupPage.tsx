import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { IconMail, IconLock, IconGoogle, IconFacebook, IconUser, IconPhone, IconMapPin, IconMotorcycle, IconArrowRight } from '@/components/Icons';
import { LogoMark } from '@/components/Logo';
import SocialLoginButton from '@/components/SocialLoginButton';

type UserRole = 'passenger' | 'rider';
const RWANDA_PHONE_REGEX = /^\+250\s?\d{3}\s?\d{3}\s?\d{3}$/;
const isUserRole = (value: string | null): value is UserRole =>
  value === 'passenger' || value === 'rider';

const SignupPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const requestedRole = searchParams.get('role');
  const defaultRole: UserRole = isUserRole(requestedRole) ? requestedRole : 'passenger';
  const [step, setStep] = useState<'role' | 'form'>(isUserRole(requestedRole) ? 'form' : 'role');
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signup, loginWithGoogle, loginWithFacebook } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedPhone = phone.replace(/\s+/g, ' ').trim();

    if (!normalizedName) {
      setError('Enter your full name');
      return;
    }

    if (!RWANDA_PHONE_REGEX.test(normalizedPhone)) {
      setError('Enter a valid Rwanda phone number like +250 788 000 001');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await signup(normalizedName, email, password, role, normalizedPhone);
      if (result.success) {
        navigate(role === 'passenger' ? '/passenger' : '/rider', { replace: true });
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialLogin = async (
    action: (role: UserRole) => Promise<{ success: boolean; error?: string }>
  ) => {
    setError('');
    try {
      const result = await action(role);
      if (result.success) {
        navigate(role === 'passenger' ? '/passenger' : '/rider', { replace: true });
      } else {
        setError(result.error || 'Social login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    }
  };

  const roleCards = [
    {
      role: 'passenger' as UserRole,
      title: 'I need a ride',
      desc: 'Sign up as a passenger to find nearby motorcyclists',
      icon: <IconMapPin size={24} />,
      color: 'hover:border-primary-300 hover:bg-primary-50/50',
      activeColor: 'border-primary-500 bg-primary-50 ring-2 ring-primary-100',
      iconBg: 'bg-primary-50 text-primary-600',
    },
    {
      role: 'rider' as UserRole,
      title: 'I am a rider',
      desc: 'Sign up as a motorcyclist to find passengers',
      icon: <IconMotorcycle size={24} />,
      color: 'hover:border-emerald-300 hover:bg-emerald-50/50',
      activeColor: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100',
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
  ];

  if (step === 'role') {
    return (
      <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[400px] slide-up">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 w-fit">
              <LogoMark size={48} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Join MotoConnect</h1>
            <p className="text-gray-400 mt-1 text-sm">Choose how you want to use MotoConnect</p>
          </div>
          <div className="space-y-3 mb-6">
            {roleCards.map((card) => (
              <button
                key={card.role}
                onClick={() => { setRole(card.role); setStep('form'); }}
                className={`w-full flex items-center gap-4 bg-white border-2 border-[#e3e6ed] rounded-2xl p-5 text-left transition-all ${card.color} hover:shadow-sm`}
              >
                <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                  {card.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-sm">{card.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{card.desc}</p>
                </div>
                <IconArrowRight size={16} className="text-gray-300" />
              </button>
            ))}
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-semibold hover:underline">Log in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-[400px] slide-up">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-fit">
            <LogoMark size={48} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Create account</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Signing up as <span className="font-semibold text-primary-600">{role === 'passenger' ? 'Passenger' : 'Rider'}</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e3e6ed] shadow-sm p-6 sm:p-7">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2.5 rounded-xl mb-4 text-xs font-medium">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Full Name</label>
              <div className="relative">
                <IconUser size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="Your full name"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Email</label>
              <div className="relative">
                <IconMail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="you@email.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Phone Number</label>
              <div className="relative">
                <IconPhone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="+250 788 000 001"
                  required
                  pattern="^\+250\s?\d{3}\s?\d{3}\s?\d{3}$"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Password</label>
              <div className="relative">
                <IconLock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-700 hover:bg-primary-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg hover:shadow-primary-200 active:scale-[0.99] text-[13px]"
            >
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
            <div className="relative py-1">
              <div className="border-t border-[#eceef3]" />
              <span className="absolute inset-x-0 -top-1.5 mx-auto w-fit bg-white px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-300">
                Or
              </span>
            </div>
            <SocialLoginButton
              label="Continue with Google"
              icon={<IconGoogle size={18} />}
              onClick={() => handleSocialLogin(loginWithGoogle)}
            />
            <SocialLoginButton
              label="Continue with Facebook"
              icon={<IconFacebook size={18} />}
              onClick={() => handleSocialLogin(loginWithFacebook)}
            />
          </form>
          <div className="mt-5 text-center space-y-2">
            <p className="text-gray-400 text-xs">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-semibold hover:underline">Log in</Link>
            </p>
            <button
              onClick={() => setStep('role')}
              className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              Change account type
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
