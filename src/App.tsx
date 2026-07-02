import { Routes, Route } from 'react-router'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PassengerHome from './pages/PassengerHome'
import RiderHome from './pages/RiderHome'
import PricingPage from './pages/PricingPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <div className="min-h-screen bg-surface-secondary">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/passenger"
          element={
            <ProtectedRoute allowedRoles={['passenger']}>
              <PassengerHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rider"
          element={
            <ProtectedRoute allowedRoles={['rider']}>
              <RiderHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pricing"
          element={
            <ProtectedRoute allowedRoles={['rider']}>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center">
              <div className="text-center slide-up">
                <div className="w-14 h-14 bg-surface-tertiary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl text-gray-300">?</span>
                </div>
                <h3 className="text-base font-semibold text-gray-700 mb-1">Page not found</h3>
                <p className="text-xs text-gray-400 mb-5">The page you're looking for doesn't exist</p>
                <a href="/" className="inline-flex items-center gap-1.5 bg-primary-600 text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-primary-700 transition-all">
                  Back to home
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  )
}
