import { Routes, Route, Link } from 'react-router'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PassengerSignup from './pages/PassengerSignup'
import RiderSignup from './pages/RiderSignup'
import RiderVerification from './pages/RiderVerification'
import PassengerHome from './pages/PassengerHome'
import RiderHome from './pages/RiderHome'
import PricingPage from './pages/PricingPage'
import SettingsPage from './pages/SettingsPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'

export default function App() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Navbar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/passenger" element={<PassengerSignup />} />
          <Route path="/signup/rider" element={<RiderSignup />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
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
              <ProtectedRoute allowedRoles={['rider']} requireVerifiedRider>
                <RiderHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rider/verification"
            element={
              <ProtectedRoute>
                <RiderVerification />
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
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route
            path="*"
            element={
              <div className="min-h-[calc(100vh-60px)] flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-base font-semibold text-ink mb-1">Page not found</h3>
                  <p className="text-sm text-ink/55 mb-5">The page you're looking for doesn't exist</p>
                  <Link to="/" className="inline-flex items-center gap-1.5 bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-800">
                    Back to home
                  </Link>
                </div>
              </div>
            }
          />
        </Routes>
      </div>
    </div>
  )
}
