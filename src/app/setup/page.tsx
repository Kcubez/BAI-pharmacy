import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { SetupForm } from '@/app/setup/setup-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Initial System Setup',
};

export default async function SetupPage() {
  // Security Check: If a user already exists, bounce to login.
  // This page is strictly for the FIRST deployment setup.
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-lg mx-auto flex items-center justify-center mb-6 shadow-sm shadow-primary/20">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
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
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2 ">
            System Initialization
          </h1>
          <p className="text-muted-foreground">
            Welcome to the Company Business App. Create the first super-admin account to unlock the
            system.
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  );
}
