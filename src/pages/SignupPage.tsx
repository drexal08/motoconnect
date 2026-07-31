import { Link } from 'react-router-dom';
import { Bike, User } from 'lucide-react';

/** Role picker — passengers and riders have different signup flows. */
export default function SignupPage() {
  return (
    <div className="min-h-screen bg-surface pb-16">
      <div className="max-w-lg mx-auto px-4 pt-12">
        <h1 className="text-2xl font-extrabold text-ink tracking-tight text-center mb-2">Join MotoConnect</h1>
        <p className="text-sm text-ink/55 text-center mb-8">Who are you joining as?</p>
        <div className="grid gap-4">
          <Link
            to="/signup/passenger"
            className="imigongo-card rounded-3xl p-6 flex items-center gap-4 hover:ring-2 ring-emerald-600 transition"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <User size={22} />
            </div>
            <div>
              <h2 className="font-bold text-ink">Passenger</h2>
              <p className="text-sm text-ink/55">Request rides and get matched with nearby riders.</p>
            </div>
          </Link>
          <Link
            to="/signup/rider"
            className="imigongo-card rounded-3xl p-6 flex items-center gap-4 hover:ring-2 ring-emerald-600 transition"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
              <Bike size={22} />
            </div>
            <div>
              <h2 className="font-bold text-ink">Rider</h2>
              <p className="text-sm text-ink/55">Get verified, choose a plan, and start seeing passengers.</p>
            </div>
          </Link>
        </div>
        <p className="text-center text-sm text-ink/50 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-800 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
