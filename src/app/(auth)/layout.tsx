export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">
      <div className="relative w-full max-w-md z-10 space-y-6">
        {children}
      </div>
    </div>
  );
}
