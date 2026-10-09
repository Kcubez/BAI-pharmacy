import { LoginForm } from '@/components/auth/login-form';
import { LoginFormSkeleton } from '@/components/auth/login-form-skeleton';
import { Suspense } from 'react';

export const metadata = {
  title: 'Admin Sign in',
};

export default function AdminLoginPage() {
  return (
    <>
      {/* Admin brand header — visually distinct with amber accent */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-amber-600 text-white mb-4 shadow-sm ring-1 ring-amber-500/30">
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
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-heading font-extrabold text-foreground">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'Business AI Integration'}
        </h1>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          <p className="text-xs text-amber-500 uppercase font-bold tracking-widest">
            Secure Admin Portal
          </p>
        </div>
      </div>

      <Suspense fallback={<LoginFormSkeleton isAdmin />}>
        <LoginForm requiredRole="admin" />
      </Suspense>
    </>
  );
}
