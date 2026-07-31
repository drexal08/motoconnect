import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LogoFull } from '../components/Logo';
import { ImigongoBackground } from '../components/Imigongo';
import { AlertCircle, ChevronRight, Phone } from 'lucide-react';

const RW_PHONE = /^\+250\s?(78|79|72|73)\d{7}$/;

export default function LoginPage() {
  const [phone, setPhone] = useState('+250 ');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const auth = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!RW_PHONE.test(phone)) {
      setError('Use a Rwandan number (+250 78/79 or 72/73).');
      return;
    }
    setSubmitting(true);
    auth.setUser({
      name: 'User',
      phone: phone.trim(),
      plan: 'agahozo',
      role: 'passenger',
      requestCount: 0,
    }, 'passenger');
    setSubmitting(false);
    navigate(auth.user?.role === 'rider' ? '/rider' : '/passenger');
  };

  return (
    <div className="min-h-screen bg-[#f6f7f4] relative">
      <ImigongoBackground className="absolute inset-0 z-0 opacity-50" />
      <main className="relative z-10 max-w-md mx-auto px-5 pt-12 pb-24">
        <div className="text-center mb-8 slide-up">
          <LogoFull size="lg" />
          <h1 className="mt-3 text-2xl font-extrabold text-emerald-950 tracking-tight">Welcome back</h1>
          <p className="text-sm text-emerald-800/60 mt-1">Log in with your Rwandan phone number</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 slide-up" style={{ animationDelay: '0.05s' }}>
          <div>
            <label htmlFor="login-phone" className="block text-[13px] font-semibold text-emerald-950 mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-900/30" />
              <input id="login-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full text-[16px] leading-6 pl-10 pr-4 py-3.5 rounded-xl bg-white border-2 border-emerald-100 text-emerald-950 placeholder:text-emerald-900/30 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition shadow-sm" placeholder="+250 78 123 4567" />
            </div>
            {error && <div className="text-amber-700 text-[13px] font-medium mt-1 flex items-center gap-1"><AlertCircle size={14} /> {error}</div>}
          </div>
          <button type="submit" disabled={submitting} className="w-full py-4 rounded-2xl bg-emerald-900 text-white text-base font-extrabold shadow-xl shadow-emerald-900/15 active:scale-[0.99] transition flex items-center justify-center gap-2 hover:bg-emerald-800">
            {submitting ? 'Checking...' : 'Continue'} <ChevronRight size={20} />
          </button>
        </form>
        <div className="mt-8 text-center slide-up" style={{ animationDelay: '0.1s' }}>
          <p className="text-xs text-emerald-800/40">No account? <Link to="/signup" className="font-bold text-emerald-900 underline underline-offset-2">Sign up</Link></p>
        </div>
      </main>
    </div>
  );
}
