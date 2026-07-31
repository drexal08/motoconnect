import { useAuthStore, PlanTier } from '../store/useAuthStore';
import { Bike, Zap, ShieldCheck, Check, Radio, User } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import { LogoFull } from '../components/Logo';

const PLANS: { key: PlanTier; label: string; price: string; cap: number; desc: string; highlight?: boolean }[] = [
  { key: 'agahozo', label: 'Agahozo', price: '500 RWF', cap: 10, desc: 'Daily plan. Perfect for part-time riders.', highlight: false },
  { key: 'isonga', label: 'Isonga', price: '3,000 RWF', cap: 80, desc: 'Weekly plan. Built for standard full-time riders.', highlight: false },
  { key: 'impuruza', label: 'Impuruza', price: '10,000 RWF', cap: Infinity, desc: 'Monthly plan. Unlimited pings + fastest updates.', highlight: true },
];

const SAMPLES = [
  { id: 1, name: 'Passenger A', dist: '0.3 km', status: 'Waiting' },
  { id: 2, name: 'Passenger B', dist: '0.7 km', status: 'Moving' },
  { id: 3, name: 'Passenger C', dist: '1.1 km', status: 'Waiting' },
];

export default function RiderHome() {
  const auth = useAuthStore();
  const activePlan = auth.user?.plan || 'agahozo';
  const planData = PLANS.find(p => p.key === activePlan) || PLANS[0];
  const used = auth.user?.requestCount || 0;
  const remaining = planData.cap === Infinity ? 'Unlimited' : Math.max(0, planData.cap - used);

  return (
    <div className="min-h-screen bg-[#f6f7f4] relative">
      <div className="max-w-md mx-auto px-5 pt-6 pb-24">
        <header className="flex items-center justify-between mb-6 slide-up">
          <LogoFull size="sm" />
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 bg-white/80 border border-emerald-100 rounded-xl px-3 py-1.5 shadow-sm">
            <Bike size={15} /> {auth.user?.name || 'Rider'}
          </div>
        </header>

        {/* Plan Status */}
        <section className="imigongo-card rounded-3xl p-6 shadow-xl shadow-emerald-950/5 mb-5 slide-up" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center shadow-md shadow-amber-400/20">
              <Zap size={22} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-emerald-950 leading-tight">Your Plan</h2>
              <p className="text-xs font-medium text-emerald-800/60">{planData.desc}</p>
            </div>
          </div>

          <div className="flex items-end gap-2 mb-1">
            <span className="text-4xl font-extrabold text-emerald-950 tracking-tighter">{planData.price}</span>
            <span className="text-sm font-bold text-amber-600 mb-1">/ {planData.key === 'agahozo' ? 'day' : planData.key === 'isonga' ? 'week' : 'month'}</span>
          </div>
          <div className="text-xs font-semibold text-emerald-800/60 mb-4">Plan: <span className="text-emerald-950">{planData.label}</span></div>

          <div className="bg-emerald-950 rounded-2xl p-4 text-white mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Requests used</span>
              <span className="text-xs font-medium text-emerald-200">{used} / {planData.cap === Infinity ? '∞' : planData.cap}</span>
            </div>
            <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: planData.cap === Infinity ? '15%' : Math.min(100, (used / planData.cap) * 100) + '%' }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            {PLANS.map(p => (
              <button
                key={p.key}
                onClick={() => auth.setPlan(p.key)}
                className={`relative rounded-xl border-2 px-2 py-3 text-left transition shadow-sm ${activePlan === p.key ? 'border-amber-400 bg-amber-50 text-emerald-950' : 'border-emerald-100 bg-white text-emerald-900/70 hover:border-amber-300'}`}
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wide">{p.label}</div>
                <div className="text-[13px] font-bold mt-0.5">{p.price}</div>
                <div className="text-[10px] text-emerald-800/50 mt-0.5">{p.cap === Infinity ? 'Unlimited' : p.cap + ' cap'}</div>
                {p.highlight && <div className="absolute top-1.5 right-1.5 bg-amber-400 text-[9px] font-extrabold text-emerald-950 rounded px-1">BEST</div>}
                {activePlan === p.key && <div className="absolute bottom-2 right-2"><Check size={12} className="text-amber-600" /></div>}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-emerald-800/50 mt-3">Upgrading takes effect immediately. You can change anytime.</p>
        </section>

        {/* Radar / Discovery */}
        <section className="imigongo-card rounded-3xl p-6 shadow-xl shadow-emerald-950/5 mb-5 slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center shadow-md shadow-emerald-900/20">
              <Radio size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-emerald-950 leading-tight">Live Passengers</h2>
              <p className="text-xs font-medium text-emerald-800/60">Claim pings near you</p>
            </div>
            <div className="mb-4"><MapComponent height="260px" interactive={false} markers={SAMPLES.map((s,i) => ({ id: String(s.id), lat: -1.94 + (i*0.015 - 0.02), lng: 30.06 + (i*0.015 - 0.02), name: s.name, phone: "+250 78 123 4567", destination: "Nearby", timestamp: Date.now() }))} /></div>
          </div>

          <div className="space-y-3">
            {SAMPLES.map(p => (
              <button key={p.id} onClick={() => { if(auth.user){ auth.addRequest(); } else { alert("Please sign up first."); } }} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-emerald-100 hover:border-amber-300 hover:shadow transition text-left">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-900 flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-emerald-950 text-sm">{p.name}</h3>
                    <span className="text-[11px] font-bold text-amber-600">{p.dist}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${p.status === 'Waiting' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.status}</span>
                    <span className="text-[11px] text-emerald-800/50">Ready for pickup</span>
                  </div>
                </div>
                <div className="text-xs font-extrabold text-emerald-900">Claim</div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs font-medium text-emerald-800/50">
            <span>Remaining today: <strong className="text-emerald-950">{remaining}</strong></span>
            <span>Plan refreshes automatically</span>
          </div>
        </section>

        {/* Safety Note */}
        <section className="rounded-2xl bg-emerald-950 text-white p-5 shadow-xl shadow-emerald-950/15 slide-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="font-extrabold text-base mb-1 flex items-center gap-2"><ShieldCheck size={18} className="text-amber-300" /> Safety First</h3>
          <p className="text-sm text-emerald-200/80 leading-relaxed">Only verified passengers see you. All rides are tracked for your protection.</p>
        </section>
      </div>
    </div>
  );
}
