'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, LogIn, Mail, Lock } from 'lucide-react';
import { loginSchema, type LoginFormValues } from '@/lib/validations';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';

export function LoginForm({ requiredRole }: { requiredRole?: 'admin' | 'user' }) {
  const isAdmin = requiredRole === 'admin';
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? (isAdmin ? '/admin/users' : '/pharmacy');
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError('');
    const { data, error } = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (error) {
      const message = error.message ?? 'Invalid credentials. Please try again.';
      setServerError(message);
      toast.error(message);
      return;
    }

    // Role enforcement
    if (requiredRole && data?.user?.role && data.user.role !== requiredRole) {
      const { signOut } = await import('@/lib/auth-client');
      await signOut();
      const message = `Access denied. This portal is strictly for ${requiredRole}s.`;
      setServerError(message);
      toast.error(message);
      return;
    }

    toast.success(isAdmin ? 'Admin signed in successfully' : 'Signed in successfully');
    router.push(callbackUrl);
    router.refresh();
  };

  const isLoading = form.formState.isSubmitting;

  return (
    <Card className="border-border bg-card/70 backdrop-blur-xl shadow-sm rounded-lg ring-1 ring-border overflow-hidden">
      <CardHeader className="space-y-1.5 pb-6 pt-8 px-6 border-b border-border bg-muted/30 text-center">
        <CardTitle className="text-2xl font-heading font-extrabold  text-foreground">
          Welcome back
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-5 p-6">
            {serverError && (
              <div
                role="alert"
                className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-xs font-medium text-destructive flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" aria-hidden />
                {serverError}
              </div>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-muted-foreground text-xs font-semibold uppercase ">
                    Email Address
                  </FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <Mail
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                        aria-hidden
                      />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="pl-10 h-11 bg-background border-input text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-ring rounded-lg"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-destructive text-xs mt-1" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-muted-foreground text-xs font-semibold uppercase ">
                    Password
                  </FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <Lock
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                        aria-hidden
                      />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pl-10 pr-10 h-11 bg-background border-input text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-ring rounded-lg"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => !p)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" aria-hidden />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-destructive text-xs mt-1" />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-4 p-6 pt-2 border-t border-border bg-muted/20">
            <Button
              id="login-submit"
              type="submit"
              className={`w-full h-11 font-semibold rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 ${
                isAdmin
                  ? 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring'
              }`}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LogIn data-icon="inline-start" />
              )}
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
