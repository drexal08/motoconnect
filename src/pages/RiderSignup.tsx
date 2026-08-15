import { useState } from 'react';
import { Link } from 'react-router-dom';
import PhoneOtpForm from '../components/PhoneOtpForm';
import { Button, FormField, Input } from '../components/ui';
import { LogoFull } from '../components/Logo';
import { ImigongoDivider } from '../components/Imigongo';
import { api } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

/**
 * §4.2 — motorcyclist signup: phone → code → identity details →
 * pending_verification. A rider sees NOTHING until verified.
 * Driver licence format is an OPEN QUESTION (PRD §10) — free text for now.
 */
export default function RiderSignupPage() {
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const continueToOtp = () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!/^1\d{15}$/.test(nationalId.trim())) {
      setError('National ID must be 16 digits and start with 1.');
      return;
    }
    if (licenseNumber.trim().length < 4) {
      setError('Enter your full driver licence number.');
      return;
    }
    // Three leading letters: RA + series letter, then 3 digits and a suffix.
    if (!/^R[A-Z]{2}\d{3}[A-Z]$/.test(plateNumber.trim().toUpperCase().replace(/[\s-]/g, ''))) {
      setError('Plate numbers look like RAD123B. Check for typos.');
      return;
    }
    if (!terms) {
      setError('You need to agree to the Terms and Privacy Policy to continue.');
      return;
    }
    setStep('otp');
  };

  const onVerified = async (_token: string) => {
    // Create the rider profile (pending_verification until a human verifies).
    try {
      await api('/api/riders/apply', {
        method: 'POST',
        body: { nationalId: nationalId.trim(), licenseNumber: licenseNumber.trim(), plateNumber: plateNumber.trim() },
      });
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save your rider details.');
    }
  };

  return (
    <div className="min-h-screen imigongo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="imigongo-card rounded-3xl p-8">
          <div className="flex justify-center mb-6">
            <LogoFull />
          </div>
          <h1 className="text-xl font-bold text-ink text-center mb-1">Ride as a motorcyclist</h1>
          <p className="text-sm text-ink-muted text-center mb-6">
            {step === 'details'
              ? 'Your details are checked by our team before you can see any ride requests.'
              : 'We sent you a code to verify your phone.'}
          </p>

          {step === 'details' ? (
            <div className="space-y-4">
              <FormField label="Full Name" htmlFor="rname">
                <Input
                  id="rname"
                  autoComplete="name"
                  placeholder="e.g. Eric Mugisha"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>
              <FormField label="National ID Number" htmlFor="nid" hint="16 digits, starting with 1.">
                <Input
                  id="nid"
                  inputMode="numeric"
                  placeholder="1 1980 12345 67890"
                  value={nationalId}
                  maxLength={16}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <FormField
                label="Driver's License Number"
                htmlFor="license"
                hint="The exact format is being confirmed with RNP. Enter the number on your licence."
              >
                <Input
                  id="license"
                  placeholder="e.g. DL-RW-48291"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                />
              </FormField>
              <FormField label="Plate Number" htmlFor="plate" hint="Current plates have no spaces, e.g. RAD123B.">
                <Input
                  id="plate"
                  placeholder="RAD123B"
                  value={plateNumber}
                  maxLength={7}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                />
              </FormField>
              <label className="flex items-start gap-3 text-sm text-ink/75 cursor-pointer">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-emerald-700"
                />
                <span>
                  I agree to the{' '}
                  <Link to="/terms" className="text-emerald-800 font-semibold underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-emerald-800 font-semibold underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {error && <p className="text-sm font-medium text-red-700">{error}</p>}
              <Button fullWidth onClick={continueToOtp}>
                Continue
              </Button>
              <p className="text-xs text-ink-subtle text-center">
                Next you will photograph your ID, licence and plate so our team can check them.
              </p>
            </div>
          ) : (
            <>
              <PhoneOtpForm
                // Straight into document capture: the numbers just collected
                // are unverifiable on their own, so the photos are part of
                // signup rather than an optional afterthought.
                nextUrl="/rider/documents"
                submitLabel="Send me a code"
                verifyBody={{ name: name.trim(), termsAccepted: terms }}
                onVerified={onVerified}
              />
              {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
            </>
          )}

          <ImigongoDivider className="my-6" />
          <p className="text-sm text-ink-muted text-center">
            Just riding?{' '}
            <Link to="/signup" className="font-semibold text-emerald-800 hover:underline">
              Create a passenger account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
