import { Link } from 'react-router-dom';
import { Bike, Clock3, MapPin, ShieldCheck, Smartphone, Star, User } from 'lucide-react';
import MapView from '../components/MapView';

/** Landing page — no placeholder stats (§7.4). CTAs route to real flows. */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface">
      <section className="imigongo-bg border-b border-border overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 pt-14 pb-10 sm:pt-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 px-4 py-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wide">
            Rwanda's moto ride matching
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold text-ink tracking-tight leading-[1.08]">
            Get a moto ride anywhere
            <br />
            <span className="text-emerald-700">in Rwanda</span>
          </h1>
          <p className="mt-4 text-ink/60 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
            Share your location, match with a nearby verified rider, and go. Your exact pickup
            point is only revealed after you confirm your rider.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/signup/passenger"
              className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
            >
              <User size={18} /> Get a ride
            </Link>
            <Link
              to="/signup/rider"
              className="w-full sm:w-auto bg-white border-2 border-emerald-200 hover:border-emerald-400 text-emerald-800 font-bold px-8 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Bike size={18} /> Ride and earn
            </Link>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-10">
          <div className="imigongo-card rounded-3xl p-3 shadow-xl">
            <MapView height="260px" />
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-center text-2xl font-extrabold text-ink tracking-tight mb-8">How it works</h2>
        <div className="grid sm:grid-cols-2 gap-8">
          <div>
            <h3 className="font-bold text-emerald-800 text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
              <User size={16} /> For passengers
            </h3>
            <Steps
              items={[
                { icon: <Smartphone size={18} />, text: 'Sign up with your phone number' },
                { icon: <MapPin size={18} />, text: 'Share your location once to request a ride' },
                { icon: <ShieldCheck size={18} />, text: 'Confirm a nearby rider — only then do they see your exact pickup point' },
                { icon: <Star size={18} />, text: 'Pay the fare as you usually do, then rate the ride' },
              ]}
            />
          </div>
          <div>
            <h3 className="font-bold text-emerald-800 text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
              <Bike size={16} /> For riders
            </h3>
            <Steps
              items={[
                { icon: <ShieldCheck size={18} />, text: 'Apply with your national ID and license — we verify you' },
                { icon: <Smartphone size={18} />, text: 'Choose a plan from 500 RWF, paid with MTN MoMo or Airtel Money' },
                { icon: <MapPin size={18} />, text: 'See anonymized passengers near you on the live radar' },
                { icon: <Clock3 size={18} />, text: 'Claim, confirm, pick up, and get rated by passengers' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="bg-white border-t border-border py-14">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-extrabold text-ink tracking-tight mb-3">Plans from 500 RWF</h2>
          <p className="text-sm text-ink/55 max-w-md mx-auto mb-6">
            Agahozo (500 RWF/day), Isonga (3,000 RWF/week), or Impuruza (10,000 RWF/month,
            unlimited claims). Claims only count once a passenger confirms you.
          </p>
          <Link
            to="/signup/rider"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-ink font-bold px-8 py-3 rounded-xl transition-all text-sm"
          >
            See plans as a rider
          </Link>
        </div>
      </section>

      <footer className="bg-ink text-ink/70 py-10 mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p className="font-semibold text-white">MotoConnect</p>
          <nav className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/login" className="hover:text-white transition-colors">Sign in</Link>
          </nav>
          <p>© {new Date().getFullYear()} MotoConnect Rwanda</p>
        </div>
      </footer>
    </div>
  );
}

function Steps({ items }: { items: { icon: React.ReactNode; text: string }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-border">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            {s.icon}
          </div>
          <p className="text-sm text-ink/75 leading-relaxed pt-0.5">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
