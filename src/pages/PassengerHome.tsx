import { useLocationStore } from '../store/useLocationStore';
import MapComponent from '../components/MapComponent';
import { MapPin, Navigation, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { LogoFull } from '../components/Logo';

export default function PassengerHome() {
  const loc = useLocationStore();
  const auth = useAuthStore();

  return (
    <div className="min-h-screen bg-[#f6f7f4] relative">
      <div className="max-w-md mx-auto px-5 pt-6 pb-24">
        <header className="flex items-center justify-between mb-6 slide-up">
          <LogoFull size="sm" />
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 bg-white/80 border border-emerald-100 rounded-xl px-3 py-1.5 shadow-sm">
            <User size={15} /> {auth.user?.name || 'Passenger'}
          </div>
        </header>

        {/* Live Status Card */}
        <section className="imigongo-card rounded-3xl p-6 shadow-xl shadow-emerald-950/5 mb-5 slide-up" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${loc.permissionGranted ? 'bg-amber-400 text-emerald-950' : 'bg-emerald-900 text-white'}`}>
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-emerald-950 leading-tight">Your Live Location</h2>
              <p className="text-xs font-medium text-emerald-800/60">Shared safely with riders nearby</p>
            </div>
          </div>

          {!loc.permissionGranted ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
              <p className="text-sm text-emerald-900 font-medium mb-3">Share where you are so riders can find you fast.</p>
              <button
                onClick={() => { loc.grantPermission(); loc.startSharing(); }}
                className="w-full py-3.5 rounded-xl bg-emerald-900 text-white font-extrabold text-base shadow-lg shadow-emerald-900/20 hover:bg-emerald-800 transition flex items-center justify-center gap-2"
              >
                <Navigation size={18} /> Allow MotoConnect to see your location
              </button>
              <p className="text-[11px] text-emerald-800/40 mt-3">You can turn this off anytime in settings.</p>
            </div>
          ) : (
            <div className="bg-emerald-950 text-white rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Live</span>
                <span className="text-xs font-medium text-emerald-200">Kigali</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-200 font-medium">Latitude</div>
                  <div className="text-base font-extrabold">{loc.params.lat.toFixed(4)}</div>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-200 font-medium">Longitude</div>
                  <div className="text-base font-extrabold">{loc.params.lng.toFixed(4)}</div>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-200 font-medium">Speed</div>
                  <div className="text-base font-extrabold">{loc.params.speed.toFixed(1)} km/h</div>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-200 font-medium">Heading</div>
                  <div className="text-base font-extrabold">{loc.params.heading.toFixed(0)}°</div>
                </div>
              </div>
              <button
                onClick={() => loc.stopSharing()}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition"
              >
                Pause sharing
              </button>
            </div>
          )}
        </section>
        <section className="imigongo-card rounded-3xl p-4 shadow-xl shadow-emerald-950/5 mb-5 slide-up" style={{ animationDelay: "0.15s" }}>
          <h3 className="font-extrabold text-emerald-950 mb-2 text-sm flex items-center gap-2"><MapPin size={16} /> Live Map</h3>
          <div className="rounded-2xl overflow-hidden"><MapComponent height="260px" interactive={false} showMyLocation={loc.permissionGranted} defaultCenter={{ lat: loc.params.lat, lng: loc.params.lng }} /></div>
        </section>

        {/* Quick Info */}
        <section className="grid grid-cols-2 gap-3 slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="imigongo-card rounded-2xl p-4 shadow-sm">
            <ShieldCheck size={22} className="text-amber-500 mb-2" />
            <h3 className="font-extrabold text-emerald-950 text-sm leading-tight">Safe Matches</h3>
            <p className="text-xs text-emerald-800/60 mt-1">Only verified riders see your ping.</p>
          </div>
          <div className="imigongo-card rounded-2xl p-4 shadow-sm">
            <MapPin size={22} className="text-emerald-700 mb-2" />
            <h3 className="font-extrabold text-emerald-950 text-sm leading-tight">Near You</h3>
            <p className="text-xs text-emerald-800/60 mt-1">Riders within 2 km are alerted.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
