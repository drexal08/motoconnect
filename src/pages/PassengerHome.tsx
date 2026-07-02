import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconLocation,
  IconMapPin,
  IconPhone,
  IconClock,
  IconCheck,
  IconX,
  IconUser,
  IconShield,
  IconLogout,
} from '@/components/Icons';
import { useGeolocation } from '@/hooks/useGeolocation';

interface RideRequest {
  id: string;
  pickup: string;
  destination: string;
  status: 'requesting' | 'accepted' | 'picked_up' | 'completed' | 'cancelled';
  riderName?: string;
  riderPhone?: string;
  createdAt: number;
}

const PassengerHome: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { position, startWatching, stopWatching, isWatching, error: geoError } = useGeolocation({ watch: true });
  const [destination, setDestination] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);
  const [rideHistory, setRideHistory] = useState<RideRequest[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isSharing && !isWatching) {
      startWatching();
    } else if (!isSharing && isWatching) {
      stopWatching();
    }
  }, [isSharing, isWatching, startWatching, stopWatching]);

  useEffect(() => {
    const stored = localStorage.getItem('mc_ride_history');
    if (stored) {
      try {
        setRideHistory(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, []);

  const handleShareLocation = () => {
    if (!destination.trim()) return;
    setIsSharing(true);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleStopSharing = () => {
    setIsSharing(false);
  };

  const handleRequestRide = () => {
    if (!destination.trim()) return;
    const ride: RideRequest = {
      id: 'ride-' + Date.now(),
      pickup: position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : 'Current Location',
      destination,
      status: 'requesting',
      createdAt: Date.now(),
    };
    setActiveRide(ride);
    setTimeout(() => {
      setActiveRide(prev => prev ? {
        ...prev,
        status: 'accepted',
        riderName: 'Jean Paul M.',
        riderPhone: '+250 788 456 789',
      } : null);
    }, 3000);
  };

  const handleCancelRide = () => {
    if (activeRide) {
      const cancelled = { ...activeRide, status: 'cancelled' as const };
      setRideHistory(prev => [cancelled, ...prev]);
      localStorage.setItem('mc_ride_history', JSON.stringify([cancelled, ...rideHistory]));
    }
    setActiveRide(null);
  };

  const handleCompleteRide = () => {
    if (activeRide) {
      const completed = { ...activeRide, status: 'completed' as const };
      setRideHistory(prev => [completed, ...prev]);
      localStorage.setItem('mc_ride_history', JSON.stringify([completed, ...rideHistory]));
    }
    setActiveRide(null);
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
            <h1 className="text-xl font-extrabold text-gray-900">My Rides</h1>
            <p className="text-sm text-gray-400">Welcome back, {user?.name?.split(' ')[0]}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-all border border-transparent hover:border-[#e3e6ed]"
              title="Logout"
            >
              <IconLogout size={18} />
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                  <IconLocation size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Share Your Location</h2>
                  <p className="text-xs text-gray-400">Let nearby riders know where you are</p>
                </div>
              </div>

              {showSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl mb-4 text-xs font-medium flex items-center gap-2">
                  <IconCheck size={14} /> Your location is now being shared with nearby riders!
                </div>
              )}

              {geoError && (
                <div className="bg-amber-50 border border-amber-100 text-amber-700 px-4 py-2.5 rounded-xl mb-4 text-xs font-medium">
                  Please enable location access in your browser settings.
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Where are you going?</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    placeholder="Enter destination (e.g., Kigali Heights)"
                    className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl px-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                    disabled={isSharing}
                  />
                </div>

                <div className="flex gap-2">
                  {!isSharing ? (
                    <button
                      onClick={handleShareLocation}
                      disabled={!destination.trim()}
                      className="flex-1 bg-primary-700 hover:bg-primary-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.99] text-[13px] flex items-center justify-center gap-2"
                    >
                      <IconLocation size={16} /> Share My Location
                    </button>
                  ) : (
                    <button
                      onClick={handleStopSharing}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl transition-all text-[13px] flex items-center justify-center gap-2 border border-red-200"
                    >
                      <IconX size={16} /> Stop Sharing
                    </button>
                  )}
                </div>
              </div>

              {isSharing && position && (
                <div className="mt-4 p-3 bg-primary-50 rounded-xl border border-primary-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
                    <span className="text-xs font-semibold text-primary-700">Location Active</span>
                  </div>
                  <p className="text-[11px] text-primary-600">
                    Lat: {position.lat.toFixed(6)}, Lng: {position.lng.toFixed(6)}
                  </p>
                  <p className="text-[11px] text-primary-500 mt-0.5">
                    Accuracy: ±{Math.round(position.accuracy)}m
                  </p>
                </div>
              )}

              {isSharing && !position && (
                <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                  <span className="text-xs font-medium text-amber-700">Getting your location...</span>
                </div>
              )}
            </div>

            {activeRide && (
              <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      activeRide.status === 'requesting' ? 'bg-amber-50 text-amber-600' :
                      activeRide.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-primary-50 text-primary-700'
                    }`}>
                      <IconMapPin size={20} />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900">Active Ride</h2>
                      <p className="text-xs text-gray-400 capitalize">{activeRide.status.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    activeRide.status === 'requesting' ? 'bg-amber-50 text-amber-600' :
                    activeRide.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-primary-50 text-primary-600'
                  }`}>
                    {activeRide.status === 'requesting' && 'Finding rider...'}
                    {activeRide.status === 'accepted' && 'On the way'}
                    {activeRide.status === 'picked_up' && 'In progress'}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <IconLocation size={14} className="text-primary-500" />
                    <span><strong className="text-gray-900">From:</strong> {activeRide.pickup}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <IconMapPin size={14} className="text-primary-500" />
                    <span><strong className="text-gray-900">To:</strong> {activeRide.destination}</span>
                  </div>
                  {activeRide.riderName && (
                    <>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <IconUser size={14} className="text-primary-500" />
                        <span><strong className="text-gray-900">Rider:</strong> {activeRide.riderName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <IconPhone size={14} className="text-primary-500" />
                        <a href={`tel:${activeRide.riderPhone}`} className="text-primary-600 hover:underline">{activeRide.riderPhone}</a>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  {activeRide.riderPhone && (
                    <a
                      href={`tel:${activeRide.riderPhone}`}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                    >
                      <IconPhone size={16} /> Call Rider
                    </a>
                  )}
                  {activeRide.status === 'picked_up' ? (
                    <button
                      onClick={handleCompleteRide}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                    >
                      <IconCheck size={16} /> Complete Ride
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelRide}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 rounded-xl transition-all text-sm border border-red-200"
                    >
                      <IconX size={16} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {!activeRide && (
              <button
                onClick={handleRequestRide}
                disabled={!isSharing || !destination.trim()}
                className="w-full bg-white border border-[#e3e6ed] hover:border-primary-200 hover:shadow-sm rounded-2xl p-5 flex items-center gap-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <IconMapPin size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-sm">Request a Ride Now</h3>
                  <p className="text-xs text-gray-400">
                    {isSharing ? 'Tap to request a ride to your destination' : 'Share your location first to request a ride'}
                  </p>
                </div>
                <IconMapPin size={18} className="text-gray-300" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5">
              <h3 className="font-bold text-gray-900 text-sm mb-3">Your Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total Rides</span>
                  <span className="text-sm font-bold text-gray-900">{rideHistory.filter(r => r.status === 'completed').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">This Week</span>
                  <span className="text-sm font-bold text-gray-900">
                    {rideHistory.filter(r => r.status === 'completed' && r.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000).length}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#e3e6ed] p-5">
              <h3 className="font-bold text-gray-900 text-sm mb-3">Recent Activity</h3>
              {rideHistory.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center mx-auto mb-2">
                    <IconClock size={18} className="text-gray-300" />
                  </div>
                  <p className="text-xs text-gray-400">No rides yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {rideHistory.slice(0, 10).map(ride => (
                    <div key={ride.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-secondary">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        ride.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                        ride.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                        'bg-primary-50 text-primary-600'
                      }`}>
                        <IconMapPin size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{ride.destination}</p>
                        <p className="text-[10px] text-gray-400">{formatTime(ride.createdAt)}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        ride.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                        ride.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                        'bg-primary-50 text-primary-600'
                      }`}>
                        {ride.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-primary-800 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <IconShield size={16} className="text-primary-300" />
                <h3 className="font-bold text-sm">Safety First</h3>
              </div>
              <p className="text-xs text-primary-300 leading-relaxed">
                Always verify your rider's identity before starting the ride. Share your trip details with a trusted contact.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PassengerHome;
