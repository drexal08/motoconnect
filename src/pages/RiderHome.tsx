import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconMapPin,
  IconPhone,
  IconClock,
  IconUser,
  IconCheck,
  IconX,
  IconWallet,
  IconLocation,
  IconBuy,
  IconLogout,
  IconEye,
  IconChevronDown,
} from '@/components/Icons';
import MapComponent from '@/components/MapComponent';
import type { PassengerMarker } from '@/components/MapComponent';

interface ViewedPassenger {
  id: string;
  name: string;
  phone: string;
  destination: string;
  viewedAt: number;
}

const DEMO_PASSENGERS: PassengerMarker[] = [
  { id: '1', lat: -1.935, lng: 30.08, name: 'Jean Marie', phone: '+250 788 123 456', destination: 'Kigali Heights', timestamp: Date.now() - 300000 },
  { id: '2', lat: -1.955, lng: 30.055, name: 'Claire M.', phone: '+250 789 234 567', destination: 'Nyarutarama', timestamp: Date.now() - 600000 },
  { id: '3', lat: -1.925, lng: 30.07, name: 'Eric N.', phone: '+250 780 345 678', destination: 'Kimihurura', timestamp: Date.now() - 120000 },
  { id: '4', lat: -1.945, lng: 30.09, name: 'Aline K.', phone: '+250 785 456 789', destination: 'Gisozi', timestamp: Date.now() - 450000 },
  { id: '5', lat: -1.96, lng: 30.065, name: 'Patrick H.', phone: '+250 781 567 890', destination: 'Remera', timestamp: Date.now() - 180000 },
  { id: '6', lat: -1.93, lng: 30.045, name: 'Diane U.', phone: '+250 786 678 901', destination: 'Kacyiru', timestamp: Date.now() - 900000 },
  { id: '7', lat: -1.94, lng: 30.075, name: 'Samuel I.', phone: '+250 782 789 012', destination: 'Kicukiro', timestamp: Date.now() - 240000 },
  { id: '8', lat: -1.97, lng: 30.05, name: 'Marie L.', phone: '+250 787 890 123', destination: 'Niboye', timestamp: Date.now() - 540000 },
];

const FREE_SUBSCRIPTION = {
  tier: 'free' as const,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  viewsRemaining: 3,
};

const RiderHome: React.FC = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerMarker | null>(null);
  const [viewedPassengers, setViewedPassengers] = useState<ViewedPassenger[]>([]);
  const [viewsRemaining, setViewsRemaining] = useState(3);
  const [showPassengerList, setShowPassengerList] = useState(false);
  const isUnlimited = user?.subscription?.tier === 'max';

  useEffect(() => {
    const stored = localStorage.getItem('mc_viewed_passengers');
    if (stored) {
      try {
        setViewedPassengers(JSON.parse(stored));
      } catch { /* ignore */ }
    }

    if (user?.subscription) {
      const isExpired = new Date(user.subscription.expiresAt).getTime() <= Date.now();

      if (isExpired) {
        setViewsRemaining(FREE_SUBSCRIPTION.viewsRemaining);
        updateUser({ subscription: FREE_SUBSCRIPTION });
        return;
      }

      setViewsRemaining(user.subscription.tier === 'max' ? -1 : user.subscription.viewsRemaining);
    }
  }, [user, updateUser]);

  const handleViewPassenger = (passenger: PassengerMarker) => {
    if (!isUnlimited && viewsRemaining <= 0) {
      navigate('/pricing');
      return;
    }

    setSelectedPassenger(passenger);
    const viewed: ViewedPassenger = {
      id: passenger.id,
      name: passenger.name,
      phone: passenger.phone,
      destination: passenger.destination,
      viewedAt: Date.now(),
    };
    const updated = [viewed, ...viewedPassengers];
    setViewedPassengers(updated);
    localStorage.setItem('mc_viewed_passengers', JSON.stringify(updated));
    if (!isUnlimited) {
      const newViewsRemaining = viewsRemaining - 1;
      setViewsRemaining(newViewsRemaining);
      if (user?.subscription) {
        updateUser({
          subscription: {
            ...user.subscription,
            viewsRemaining: newViewsRemaining,
          },
        });
      }
    }
    if (isUnlimited && user?.subscription) {
      updateUser({
        subscription: {
          ...user.subscription,
          viewsRemaining: -1,
        },
      });
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)}h ago`;
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-surface-secondary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Find Passengers</h1>
            <p className="text-sm text-gray-400">Welcome back, {user?.name?.split(' ')[0]}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                !isUnlimited && viewsRemaining <= 0
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : isUnlimited
                    ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                    : 'bg-primary-50 text-primary-600 border-primary-200 hover:bg-primary-100'
              }`}
            >
              <IconEye size={12} />
              {isUnlimited ? 'Unlimited' : `${viewsRemaining} views left`}
            </Link>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-all border border-transparent hover:border-[#e3e6ed]"
              title="Logout"
            >
              <IconLogout size={18} />
            </button>
          </div>
        </div>

        {!isUnlimited && viewsRemaining <= 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <IconX size={18} className="text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-700 text-sm">You've used all your views</h3>
              <p className="text-xs text-red-500">Upgrade your plan to see more passengers</p>
            </div>
            <Link
              to="/pricing"
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all"
            >
              Upgrade
            </Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-[#e3e6ed] p-1">
              <MapComponent
                height="500px"
                markers={DEMO_PASSENGERS}
                onMarkerClick={handleViewPassenger}
                interactive
              />
            </div>

            <button
              onClick={() => setShowPassengerList(!showPassengerList)}
              className="lg:hidden w-full bg-white border border-[#e3e6ed] rounded-2xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <IconUser size={18} className="text-primary-600" />
                <span className="font-bold text-sm text-gray-900">Nearby Passengers</span>
                <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {DEMO_PASSENGERS.length}
                </span>
              </div>
              <IconChevronDown size={16} className={`text-gray-400 transition-transform ${showPassengerList ? 'rotate-180' : ''}`} />
            </button>

            <div className={`bg-white rounded-2xl border border-[#e3e6ed] p-5 ${showPassengerList ? '' : 'hidden lg:block'}`}>
              <h2 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                <IconUser size={16} className="text-primary-600" />
                Nearby Passengers
                <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {DEMO_PASSENGERS.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_PASSENGERS.map(passenger => {
                  const isViewed = viewedPassengers.some(v => v.id === passenger.id);
                  return (
                    <button
                      key={passenger.id}
                      onClick={() => handleViewPassenger(passenger)}
                      disabled={viewsRemaining <= 0 && !isViewed && !isUnlimited}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        isViewed
                          ? 'bg-emerald-50 border-emerald-200'
                          : viewsRemaining <= 0 && !isUnlimited
                            ? 'bg-gray-50 border-gray-100 opacity-50'
                            : 'bg-surface-secondary border-[#eceef3] hover:border-primary-200 hover:shadow-sm'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isViewed ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-100 text-primary-600'
                      }`}>
                        {passenger.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{passenger.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{passenger.destination}</p>
                      </div>
                      {isViewed ? (
                        <IconCheck size={14} className="text-emerald-500 shrink-0" />
                      ) : (
                        <div className="shrink-0">
                          <IconEye size={14} className="text-gray-400" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {selectedPassenger ? (
              <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5 slide-up">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 text-sm">Passenger Details</h3>
                  <button
                    onClick={() => setSelectedPassenger(null)}
                    className="p-1 rounded-lg hover:bg-surface-secondary transition-colors"
                  >
                    <IconX size={14} className="text-gray-400" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xl">
                    {selectedPassenger.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{selectedPassenger.name}</h4>
                    <p className="text-xs text-gray-400">Passenger</p>
                  </div>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <IconLocation size={14} className="text-primary-500" />
                    <span>Going to <strong className="text-gray-900">{selectedPassenger.destination}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <IconClock size={14} className="text-primary-500" />
                    <span>{formatTime(selectedPassenger.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <IconPhone size={14} className="text-primary-500" />
                    <a href={`tel:${selectedPassenger.phone}`} className="text-primary-600 hover:underline font-medium">
                      {selectedPassenger.phone}
                    </a>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`tel:${selectedPassenger.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl transition-all text-sm"
                  >
                    <IconPhone size={16} /> Call
                  </a>
                  <a
                    href={`sms:${selectedPassenger.phone}?body=Hello, I am on my way to pick you up!`}
                    className="flex-1 flex items-center justify-center gap-2 bg-surface-secondary hover:bg-[#eef0f4] text-gray-700 font-bold py-2.5 rounded-xl transition-all text-sm border border-[#e3e6ed]"
                  >
                    Message
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#e3e6ed] p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center mx-auto mb-3">
                  <IconMapPin size={24} className="text-gray-300" />
                </div>
                <h3 className="font-bold text-gray-700 text-sm mb-1">Select a Passenger</h3>
                <p className="text-xs text-gray-400">Click on a marker or passenger in the list to view their details</p>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5">
              <div className="flex items-center gap-2 mb-3">
                <IconWallet size={16} className="text-primary-600" />
                <h3 className="font-bold text-gray-900 text-sm">Your Plan</h3>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Current Tier</span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                  user?.subscription?.tier === 'max' ? 'bg-amber-100 text-amber-700' :
                  user?.subscription?.tier === 'pro' ? 'bg-primary-100 text-primary-700' :
                  user?.subscription?.tier === 'basic' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {user?.subscription?.tier || 'Free'}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">Views Remaining</span>
                <span className="text-sm font-bold text-gray-900">
                  {isUnlimited ? 'Unlimited' : viewsRemaining}
                </span>
              </div>
              <Link
                to="/pricing"
                className="w-full flex items-center justify-center gap-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold py-2 rounded-xl transition-all text-xs border border-primary-200"
              >
                <IconBuy size={14} /> Upgrade Plan
              </Link>
            </div>

            {viewedPassengers.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5">
                <h3 className="font-bold text-gray-900 text-sm mb-3">Recently Viewed</h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {viewedPassengers.slice(0, 5).map(vp => (
                    <div key={`${vp.id}-${vp.viewedAt}`} className="flex items-center gap-2 p-2 rounded-lg bg-surface-secondary">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
                        {vp.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{vp.name}</p>
                        <p className="text-[10px] text-gray-400">{formatTime(vp.viewedAt)}</p>
                      </div>
                      <a href={`tel:${vp.phone}`} className="p-1.5 rounded-lg hover:bg-white transition-colors">
                        <IconPhone size={12} className="text-primary-500" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-primary-800 rounded-2xl p-5 text-white">
              <h3 className="font-bold text-sm mb-3">Today's Stats</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary-300">Passengers Viewed</span>
                  <span className="text-sm font-bold">{viewedPassengers.filter(v => v.viewedAt > Date.now() - 86400000).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary-300">Calls Made</span>
                  <span className="text-sm font-bold">{Math.floor(viewedPassengers.length * 0.6)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary-300">Pickups</span>
                  <span className="text-sm font-bold">{Math.floor(viewedPassengers.length * 0.3)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiderHome;
