import { useState } from 'react';
import { Link } from 'react-router-dom';
import PhoneOtpForm from '../components/PhoneOtpForm';
import { Button, FormField, Input } from '../components/ui';
import { LogoFull } from '../components/Logo';
import { ImigongoDivider } from '../components/Imigongo';

/**
 * §4.1 — passenger signup: phone → code → name + terms.
 * Primary CTA is "Find me a rider", not "Allow location" (consent is step 2,
 * §3.3).
 */
export default function PassengerSignupPage() {
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [error, setError] = useState<string | null>(null);

  const continueToOtp = () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Enter your name — at least 2 characters.');
      return;
    }
    if (!terms) {
      setError('You need to agree to the Terms and Privacy Policy to continue.');
      return;
    }
    setStep('otp');
  };

  return (
    <div className="min-h-screen imigongo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="imigongo-card rounded-3xl p-8">
          <div className="flex justify-center mb-6">
            <LogoFull />
          </div>
          <h1 className="text-xl font-bold text-ink text-center mb-1">Ride with MotoConnect</h1>
          <p className="text-sm text-ink-muted text-center mb-6">
            {step === 'details'
              ? 'Tell us who you are, then verify your phone.'
              : 'We sent you a code to verify your phone.'}
          </p>

          {step === 'details' ? (
            <div className="space-y-4">
              <FormField label="Your Name" htmlFor="name">
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="e.g. Diane Uwera"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
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
            </div>
          ) : (
            <PhoneOtpForm
              nextUrl="/passenger"
              submitLabel="Send me a code"
              verifyBody={{ name: name.trim(), termsAccepted: terms }}
            />
          )}

          <ImigongoDivider className="my-6" />
          <div className="text-sm text-ink-muted space-y-1 text-center">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-emerald-800 hover:underline">
                Sign in
              </Link>
            </p>
            <p>
              A rider?{' '}
              <Link to="/signup/rider" className="font-semibold text-emerald-800 hover:underline">
                Join as a motorcyclist
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
