import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { IconMail, IconLock, IconGoogle, IconFacebook, IconUser, IconMotorcycle } from '@/components/Icons';
import { LogoMark } from '@/components/Logo';
import SocialLoginButton from '@/components/SocialLoginButton';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, loginWithGoogle, loginWithFacebook } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialLogin = async (
    action: () => Promise<{ success: boolean; error?: string }>
  ) => {
    setError('');
    try {
      const result = await action();
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Social login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-[400px] slide-up">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-fit">
            <LogoMark size={48} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-400 mt-1 text-sm">Log in to your MotoConnect account</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e3e6ed] shadow-sm p-6 sm:p-7">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2.5 rounded-xl mb-4 text-xs font-medium">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Password</label>
              <div className="relative">
                <IconLock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="Enter password"
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
              {submitting ? 'Logging in...' : 'Log in'}
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
              onClick={() => handleSocialLogin(() => loginWithGoogle())}
            />
            <SocialLoginButton
              label="Continue with Facebook"
              icon={<IconFacebook size={18} />}
              onClick={() => handleSocialLogin(() => loginWithFacebook())}
            />
          </form>
          <div className="mt-5 text-center">
            <p className="text-gray-400 text-xs">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary-600 font-semibold hover:underline">Sign up</Link>
            </p>
          </div>
        </div>
        <div className="mt-4 bg-white rounded-xl border border-[#e3e6ed] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Demo Login Hints</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setEmail('passenger@demo.com'); setPassword('password'); }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <IconUser size={12} /> Passenger
            </button>
            <button
              onClick={() => { setEmail('rider@demo.com'); setPassword('password'); }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <IconMotorcycle size={12} /> Rider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
