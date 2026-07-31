import { Link } from 'react-router-dom';
import { LogoFull } from '../components/Logo';
import { ImigongoBackground } from '../components/Imigongo';
import { Check, Bike } from 'lucide-react';

const TIERS = [
  { id: 'agahozo', name: 'Agahozo', price: '500 RWF', cap: '10 requests', desc: 'Daily plan. Perfect for part-time riders.', features: ['10 passenger requests', 'Daily access', 'Fast map updates'] },
  { id: 'isonga', name: 'Isonga', price: '3,000 RWF', cap: '80 requests', desc: 'Weekly plan. Built for standard full-time riders.', features: ['80 passenger requests', 'Weekly access', 'Fast alerts', 'Priority matching'], popular: true },
  { id: 'impuruza', name: 'Impuruza', price: '10,000 RWF', cap: 'Unlimited', desc: 'Monthly plan. Unlimited pings + fastest updates.', features: ['Unlimited passenger requests', 'Monthly access', 'Fastest updates', 'VIP matching', 'Analytics'], popular: true },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f4] relative">
      <ImigongoBackground className="absolute inset-0 z-0" />
      <main className="relative z-10 max-w-md mx-auto px-5 pt-8 pb-20">
        <div className="flex items-center justify-between mb-6">
          <LogoFull size="sm" />
          <Link to="/rider" className="text-sm font-extrabold text-emerald-900 bg-white/80 border border-emerald-100 px-3 py-1.5 rounded-xl shadow-sm">Back</Link>
        </div>
        <h1 className="text-3xl font-extrabold text-emerald-950 tracking-tight mb-2">Subscription Plans</h1>
        <p className="text-sm text-emerald-800/60 mb-6">Pick a plan, pay with MTN MoMo, and start claiming passenger pings.</p>

        <div className="space-y-4">
          {TIERS.map(t => (
            <div key={t.id} className={`imigongo-card rounded-3xl p-5 shadow-xl shadow-emerald-950/5 relative overflow-hidden ${t.popular ? 'border-2 border-amber-300' : ''}`}>
              {t.popular && <div className="absolute top-3 right-3 bg-amber-400 text-emerald-950 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md">Best Value</div>}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center"><Bike size={20} /></div>
                <div>
                  <h2 className="text-lg font-extrabold text-emerald-950">{t.name}</h2>
                  <div className="text-xs font-bold text-amber-600">{t.price} &middot; {t.cap}</div>
                </div>
              </div>
              <p className="text-xs font-medium text-emerald-800/60 mb-3">{t.desc}</p>
              <ul className="space-y-1.5 mb-4">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs font-medium text-emerald-900"><Check size={14} className="text-amber-500 shrink-0" /> {f}</li>
                ))}
              </ul>
              <Link to="/rider" className="block w-full text-center py-3 rounded-xl bg-emerald-900 text-white font-extrabold text-sm shadow-lg shadow-emerald-900/15 hover:bg-emerald-800 transition">Choose Plan</Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
