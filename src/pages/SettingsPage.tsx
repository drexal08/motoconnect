import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconUser,
  IconMail,
  IconPhone,
  IconLock,
  IconNotification,
  IconVolume,
  IconShield,
  IconCheck,
  IconLogout,
  IconChevronDown,
  IconEye,
  IconEyeOff,
} from '@/components/Icons';

const SettingsPage: React.FC = () => {
  const { user, updateUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '+250 ');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>('profile');

  const handleSaveProfile = () => {
    updateUser({ name, email, phone });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChangePassword = () => {
    if (newPassword.length >= 6) {
      setCurrentPassword('');
      setNewPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const SectionHeader = ({ id, title, icon }: { id: string; title: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveSection(activeSection === id ? null : id)}
      className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-[#e3e6ed] hover:border-primary-200 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
          {icon}
        </div>
        <span className="font-bold text-gray-900 text-sm">{title}</span>
      </div>
      <IconChevronDown size={16} className={`text-gray-400 transition-transform ${activeSection === id ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-surface-secondary">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-extrabold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400">Manage your account and preferences</p>
        </div>

        {saved && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl mb-4 text-xs font-medium flex items-center gap-2">
            <IconCheck size={14} /> Changes saved successfully!
          </div>
        )}

        <div className="space-y-3">
          <div>
            <SectionHeader id="profile" title="Profile Information" icon={<IconUser size={16} />} />
            {activeSection === 'profile' && (
              <div className="bg-white rounded-b-xl border border-t-0 border-[#e3e6ed] p-4 sm:p-5 space-y-4 slide-up">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-2xl">
                    {user?.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{user?.name}</h3>
                    <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Full Name</label>
                  <div className="relative">
                    <IconUser size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Email</label>
                  <div className="relative">
                    <IconMail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <div className="relative">
                    <IconPhone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveProfile}
                  className="bg-primary-700 hover:bg-primary-800 text-white font-bold px-6 py-2.5 rounded-xl transition-all hover:shadow-sm active:scale-[0.99] text-[13px]"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>

          <div>
            <SectionHeader id="security" title="Security" icon={<IconLock size={16} />} />
            {activeSection === 'security' && (
              <div className="bg-white rounded-b-xl border border-t-0 border-[#e3e6ed] p-4 sm:p-5 space-y-4 slide-up">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Current Password</label>
                  <div className="relative">
                    <IconLock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-10 py-2.5 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      placeholder="Enter current password"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                    >
                      {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">New Password</label>
                  <div className="relative">
                    <IconLock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      placeholder="Min 6 characters"
                    />
                  </div>
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={!currentPassword || newPassword.length < 6}
                  className="bg-primary-700 hover:bg-primary-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all hover:shadow-sm active:scale-[0.99] text-[13px]"
                >
                  Update Password
                </button>
              </div>
            )}
          </div>

          <div>
            <SectionHeader id="notifications" title="Notifications" icon={<IconNotification size={16} />} />
            {activeSection === 'notifications' && (
              <div className="bg-white rounded-b-xl border border-t-0 border-[#e3e6ed] p-4 sm:p-5 space-y-3 slide-up">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <IconNotification size={16} className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Push Notifications</p>
                      <p className="text-[11px] text-gray-400">Get notified about nearby passengers</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className={`w-11 h-6 rounded-full transition-all relative ${notifications ? 'bg-primary-600' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${notifications ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <IconVolume size={16} className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Sound Effects</p>
                      <p className="text-[11px] text-gray-400">Play sounds for notifications</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-11 h-6 rounded-full transition-all relative ${soundEnabled ? 'bg-primary-600' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${soundEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {user?.subscription && (
            <div>
              <SectionHeader id="subscription" title="Subscription" icon={<IconShield size={16} />} />
              {activeSection === 'subscription' && (
                <div className="bg-white rounded-b-xl border border-t-0 border-[#e3e6ed] p-4 sm:p-5 space-y-3 slide-up">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-500">Current Plan</span>
                    <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
                      user.subscription.tier === 'max' ? 'bg-amber-100 text-amber-700' :
                      user.subscription.tier === 'pro' ? 'bg-primary-100 text-primary-700' :
                      user.subscription.tier === 'basic' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {user.subscription.tier}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-500">Views Remaining</span>
                    <span className="text-sm font-bold text-gray-900">
                      {user.subscription.tier === 'max' ? 'Unlimited' : user.subscription.viewsRemaining}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-500">Expires</span>
                    <span className="text-sm font-medium text-gray-700">
                      {new Date(user.subscription.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl transition-all border border-red-200 text-sm"
            >
              <IconLogout size={16} /> Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
