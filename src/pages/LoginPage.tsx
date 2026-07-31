import { Link } from 'react-router-dom';
import PhoneOtpForm from '../components/PhoneOtpForm';
import { LogoFull } from '../components/Logo';
import { ImigongoDivider } from '../components/Imigongo';

export default function LoginPage() {
  return (
    <div className="min-h-screen imigongo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="imigongo-card rounded-3xl p-8">
          <div className="flex justify-center mb-6">
            <LogoFull />
          </div>
          <h1 className="text-xl font-bold text-ink text-center mb-1">Welcome back</h1>
          <p className="text-sm text-ink/55 text-center mb-6">
            Sign in with your phone number. No passwords to remember.
          </p>
          <PhoneOtpForm nextUrl="/" submitLabel="Send me a code" />
          <ImigongoDivider className="my-6" />
          <p className="text-sm text-ink/55 text-center">
            New to MotoConnect?{' '}
            <Link to="/signup" className="font-semibold text-emerald-800 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
