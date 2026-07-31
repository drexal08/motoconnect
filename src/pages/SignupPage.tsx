import { useState } from 'react';
import { Bike, ChevronRight, User, Check, AlertCircle } from 'lucide-react';
import { useAuthStore, PlanTier } from '../store/useAuthStore';
import { LogoFull } from '../components/Logo';
import { ImigongoBackground } from '../components/Imigongo';

const RW_PHONE = /^\+250\s?(78|79|72|73)\d{7}$/;
const RW_NATIONAL_ID = /^1\d{15}$/;
const RW_PLATE = /^[A-Z]{2}\s?\d{3}\s?[A-Z]$/i;

const PLANS: { key: PlanTier; label: string; price: string; cap: string; desc: string }[] = [
  { key: 'agahozo', label: 'Agahozo', price: '500 RWF', cap: '10 requests', desc: 'Daily plan. Perfect for part-time riders.' },
  { key: 'isonga', label: 'Isonga', price: '3,000 RWF', cap: '80 requests', desc: 'Weekly plan. Built for standard full-time riders.' },
  { key: 'impuruza', label: 'Impuruza', price: '10,000 RWF', cap: 'Unlimited', desc: 'Monthly plan. Fastest updates + unlimited pings. Best value.' },
];

export default function SignupPage() {
  const [mode, setMode] = useState<'passenger' | 'rider'>('passenger');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+250 ');
  const [nationalId, setNationalId] = useState('');
  const [license, setLicense] = useState('');
  const [plate, setPlate] = useState('');
  const [plan, setPlan] = useState<PlanTier>('agahozo');
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const auth = useAuthStore();

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Enter your full name.';
    if (!RW_PHONE.test(phone)) e.phone = 'Use a Rwandan number (+250 78/79 or 72/73).';
    if (mode === 'rider') {
      if (!RW_NATIONAL_ID.test(nationalId)) e.nationalId = 'National ID must be 16 digits starting with 1.';
      if (!license.trim()) e.license = 'Enter your driver license number.';
      if (!RW_PLATE.test(plate)) e.plate = 'Plate format like RE 123 A.';
      if (!plan) e.plan = 'Choose a plan.';
    }
    if (mode === 'passenger' && !agreed) e.agreed = 'You must agree to the terms.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const userData = {
      name: name.trim(),
      phone: phone.trim(),
      nationalId: mode === 'rider' ? nationalId.trim() : undefined,
      driversLicense: mode === 'rider' ? license.trim() : undefined,
      plate: mode === 'rider' ? plate.trim() : undefined,
      plan: mode === 'rider' ? plan : 'agahozo',
      requestCount: 0,
    };
    auth.setUser(userData as any, mode);
    setSubmitted(true);
  };

  const labelClass = 'block text-[13px] font-semibold text-emerald-950 mb-1.5 tracking-tight';
  const inputClass = 'w-full text-[16px] leading-6 px-4 py-3.5 rounded-xl bg-white border-2 border-emerald-100 text-emerald-950 placeholder:text-emerald-900/30 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition shadow-sm';
  const errorClass = 'text-amber-700 text-[13px] font-medium mt-1 flex items-center gap-1';

  return (
    <div className="min-h-screen bg-[#f6f7f4] relative overflow-x-hidden">
      <ImigongoBackground className="absolute inset-0 z-0 opacity-50" />
      <main className="relative z-10 max-w-md mx-auto px-5 pt-10 pb-20">
        {/* Header Logo */}
        <div className="flex flex-col items-center mb-8 slide-up">
          <LogoFull size="lg" />
          <h1 className="mt-3 text-2xl font-extrabold text-emerald-950 tracking-tight text-center leading-tight">
            Join MotoConnect
          </h1>
          <p className="mt-1.5 text-sm text-emerald-800/70 text-center font-medium">Quick sign-up for Rwanda</p>
        </div>

        {/* Mode Switch */}
        <div className="flex rounded-2xl bg-white/80 border border-emerald-100/60 p-1 shadow-sm mb-6 slide-up" style={{ animationDelay: '0.05s' }}>
          <button
            onClick={() => { setMode('passenger'); setErrors({}); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 ${mode === 'passenger' ? 'bg-emerald-900 text-white shadow-emerald-900/20' : 'text-emerald-900/60 hover:text-emerald-900 bg-transparent'}`}
          >
            <User size={16} /> Passenger
          </button>
          <button
            onClick={() => { setMode('rider'); setErrors({}); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 ${mode === 'rider' ? 'bg-amber-400 text-emerald-950 shadow-amber-400/20' : 'text-emerald-900/60 hover:text-emerald-900 bg-transparent'}`}
          >
            <Bike size={16} /> Rider
          </button>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5 slide-up" style={{ animationDelay: '0.1s' }}>
            <div>
              <label htmlFor="name" className={labelClass}>{mode === 'passenger' ? 'Your Name' : 'Full Name'}</label>
              <input id="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className={inputClass} />
              {errors.name && <div className={errorClass}><AlertCircle size={14} /> {errors.name}</div>}
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>Phone Number</label>
              <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+250 78 123 4567" className={inputClass} />
              {errors.phone && <div className={errorClass}><AlertCircle size={14} /> {errors.phone}</div>}
            </div>

            {mode === 'rider' && (
              <>
                <div>
                  <label htmlFor="nid" className={labelClass}>National ID Number</label>
                  <input id="nid" inputMode="numeric" value={nationalId} onChange={e => setNationalId(e.target.value)} placeholder="1 2345 6789 0123 456" maxLength={16} className={inputClass} />
                  <p className="text-[12px] text-emerald-800/50 mt-1">Exactly 16 digits starting with 1.</p>
                  {errors.nationalId && <div className={errorClass}><AlertCircle size={14} /> {errors.nationalId}</div>}
                </div>
                <div>
                  <label htmlFor="license" className={labelClass}>Driver's License Number</label>
                  <input id="license" value={license} onChange={e => setLicense(e.target.value)} placeholder="RWA-1234567" className={inputClass} />
                  {errors.license && <div className={errorClass}><AlertCircle size={14} /> {errors.license}</div>}
                </div>
                <div>
                  <label htmlFor="plate" className={labelClass}>Plate Number</label>
                  <input id="plate" value={plate} onChange={e => setPlate(e.target.value)} placeholder="RE 123 A" className={inputClass} />
                  <p className="text-[12px] text-emerald-800/50 mt-1">Example: RE 123 A</p>
                  {errors.plate && <div className={errorClass}><AlertCircle size={14} /> {errors.plate}</div>}
                </div>
                <div>
                  <label className={labelClass}>Choose a Plan</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {PLANS.map((p) => (
                      <button key={p.key} type="button" onClick={() => setPlan(p.key)}
                        className={`relative rounded-xl border-2 px-2 py-3 text-left transition shadow-sm ${plan === p.key ? 'border-amber-400 bg-amber-50 text-emerald-950' : 'border-emerald-100 bg-white text-emerald-900/70 hover:border-amber-300'}`}>
                        <div className="text-[11px] font-extrabold uppercase tracking-wide">{p.label}</div>
                        <div className="text-[13px] font-bold mt-1">{p.price}</div>
                        <div className="text-[11px] text-emerald-800/50 mt-0.5">{p.cap}</div>
                        {plan === p.key && <div className="absolute top-2 right-2"><Check size={12} className="text-amber-600" /></div>}
                      </button>
                    ))}
                  </div>
                  {errors.plan && <div className={errorClass}><AlertCircle size={14} /> {errors.plan}</div>}
                </div>
              </>
            )}

            {mode === 'passenger' && (
              <label className={`flex items-start gap-3 p-3 rounded-xl border-2 transition cursor-pointer ${agreed ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-100 bg-white'}`}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-5 h-5 accent-amber-400 rounded-md border-emerald-300 shrink-0" />
                <span className="text-sm text-emerald-950 font-medium leading-snug">Agree to Terms. I allow MotoConnect to see my live location and match me with riders.</span>
              </label>
            )}
            {errors.agreed && <div className={errorClass}><AlertCircle size={14} /> {errors.agreed}</div>}

            <button type="submit" className="w-full py-4 rounded-2xl bg-emerald-900 text-white text-base font-extrabold shadow-xl shadow-emerald-900/15 active:scale-[0.99] transition flex items-center justify-center gap-2 hover:bg-emerald-800">
              Continue <ChevronRight size={20} />
            </button>
          </form>
        ) : (
          <div className="text-center slide-up py-10">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-900 text-white flex items-center justify-center shadow-2xl shadow-emerald-900/20">
              <Check size={36} strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-extrabold text-emerald-950 mb-2">You are in!</h2>
            <p className="text-emerald-800/70 mb-6">Welcome to MotoConnect. {mode === 'rider' ? 'Your plan is active.' : 'Share your location when ready.'}</p>
            <a href={mode === 'passenger' ? '/passenger' : '/rider'} className="inline-flex items-center gap-2 bg-amber-400 text-emerald-950 px-7 py-3.5 rounded-2xl font-extrabold shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition">
              Go to Dashboard <ChevronRight size={18} />
            </a>
          </div>
        )}

        {/* Branding footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-emerald-900/30 font-medium">MotoConnect Rwanda &middot; Safe rides, faster matches</p>
        </div>
      </main>
    </div>
  );
}
