import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { LogoFull } from '../components/Logo';
import { ImigongoBackground } from '../components/Imigongo';
import { User, LogOut, Check, Shield, Bell } from 'lucide-react';

export default function SettingsPage() {
  const auth = useAuthStore();
  const [name, setName] = useState(auth.user?.name || '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (auth.user) auth.setUser({ ...auth.user, name: name.trim() }, auth.user.role);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f6f7f4] relative">
      <ImigongoBackground className="absolute inset-0 z-0 opacity-50" />
      <main className="relative z-10 max-w-md mx-auto px-5 pt-8 pb-24">
        <div className="flex items-center justify-between mb-6">
          <LogoFull size="sm" />
        </div>
        <h1 className="text-2xl font-extrabold text-emerald-950 tracking-tight mb-6">Settings</h1>

        <section className="imigongo-card rounded-3xl p-5 shadow-xl shadow-emerald-950/5 mb-4">
          <h2 className="font-extrabold text-emerald-950 mb-3 flex items-center gap-2"><User size={18} /> Profile</h2>
          <label className="block text-[13px] font-semibold text-emerald-950 mb-1.5">Your Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full text-[16px] px-4 py-3 rounded-xl bg-white border-2 border-emerald-100 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none transition shadow-sm mb-3" />
          <div className="text-xs font-medium text-emerald-800/50 mb-2">Phone: {auth.user?.phone || '-'}</div>
          <button onClick={save} className="w-full py-3 rounded-xl bg-emerald-900 text-white font-extrabold text-sm shadow-lg shadow-emerald-900/15 hover:bg-emerald-800 transition flex items-center justify-center gap-2">{saved ? <><Check size={16}/> Saved</> : 'Save Changes'}</button>
        </section>

        <section className="imigongo-card rounded-3xl p-5 shadow-xl shadow-emerald-950/5 mb-4">
          <h2 className="font-extrabold text-emerald-950 mb-3 flex items-center gap-2"><Shield size={18} /> Safety</h2>
          <p className="text-sm text-emerald-800/70 leading-relaxed">Your location is only shared with verified riders. You can turn off sharing anytime in your ride screen.</p>
        </section>

        <section className="imigongo-card rounded-3xl p-5 shadow-xl shadow-emerald-950/5 mb-4">
          <h2 className="font-extrabold text-emerald-950 mb-3 flex items-center gap-2"><Bell size={18} /> Notifications</h2>
          <div className="flex items-center justify-between text-sm font-medium text-emerald-950 mb-2"><span>Ride alerts</span><span className="text-amber-600">On</span></div>
          <div className="flex items-center justify-between text-sm font-medium text-emerald-950"><span>Plan updates</span><span className="text-amber-600">On</span></div>
        </section>

        <button onClick={() => auth.logout()} className="w-full py-3.5 rounded-2xl bg-red-50 text-red-700 font-extrabold text-sm border border-red-100 hover:bg-red-100 transition flex items-center justify-center gap-2"><LogOut size={16}/> Log out</button>
      </main>
    </div>
  );
}
