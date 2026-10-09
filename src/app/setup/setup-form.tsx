'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function SetupForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize standard admin.');
      }

      router.push('/login?setup=success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border bg-card/70 backdrop-blur-xl shadow-sm">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-xl font-heading text-foreground">Super Admin Details</CardTitle>
        <CardDescription className="text-muted-foreground">
          This account will have permanent, irrevocable access to all system features.
        </CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-foreground" htmlFor="name">
              Full Name
            </Label>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="bg-background border-input text-foreground placeholder:text-muted-foreground/60 h-11"
              placeholder="System Administrator"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground" htmlFor="email">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="bg-background border-input text-foreground placeholder:text-muted-foreground/60 h-11"
              placeholder="admin@startup.com"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground" htmlFor="password">
              Secure Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="bg-background border-input text-foreground placeholder:text-muted-foreground/60 h-11 pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
        </CardContent>

        <CardFooter className="pt-4">
          <Button
            type="submit"
            className="w-full h-11 bg-primary text-primary-foreground font-semibold  hover:bg-primary/90 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={isLoading || !formData.email || !formData.password || !formData.name}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="w-4 h-4 mr-2" aria-hidden />
            )}
            Initialize System
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
