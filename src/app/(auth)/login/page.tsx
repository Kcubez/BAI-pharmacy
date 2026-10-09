import { LoginForm } from '@/components/auth/login-form';
import { LoginFormSkeleton } from '@/components/auth/login-form-skeleton';
import { Suspense } from 'react';

export const metadata = {
  title: 'Sign in',
};

export default function LoginPage() {
  return (
    <>
      {/* Brand header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-primary text-primary-foreground mb-4 shadow-sm ring-1 ring-border">
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-heading font-extrabold text-foreground">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'Business AI Integration'}
        </h1>
        
      </div>

      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm requiredRole="user" />
      </Suspense>
    </>
  );
}
