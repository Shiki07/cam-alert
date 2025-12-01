
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Camera, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showEmailSent, setShowEmailSent] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [verificationError, setVerificationError] = useState('');
  
  const { signUp, signIn, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle email verification callback - process tokens from URL
  useEffect(() => {
    const handleAuthCallback = async () => {
      // Check for error in URL params (from Supabase redirect)
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      
      if (errorParam) {
        console.log('Auth error from URL:', errorParam, errorDescription);
        setVerificationStatus('error');
        if (errorDescription?.includes('expired') || errorDescription?.includes('invalid')) {
          setVerificationError('This verification link has expired or already been used. Please request a new one.');
        } else {
          setVerificationError(errorDescription || 'Verification failed. Please try again.');
        }
        return;
      }

      // Check for hash fragment with tokens (Supabase sends tokens in URL hash)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && refreshToken) {
        console.log('Processing auth callback with tokens, type:', type);
        setVerificationStatus('processing');
        
        try {
          // Set the session from the tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('Error setting session:', error);
            setVerificationStatus('error');
            setVerificationError(error.message || 'Failed to verify your account. Please try again.');
            return;
          }

          if (data.session) {
            console.log('Session set successfully, user verified');
            setVerificationStatus('success');
            
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
            
            toast({
              title: "Email verified!",
              description: "Your account has been verified. Redirecting to your dashboard...",
            });
            
            // Short delay to show success message, then redirect
            setTimeout(() => {
              navigate('/');
            }, 1500);
          }
        } catch (err) {
          console.error('Error processing auth callback:', err);
          setVerificationStatus('error');
          setVerificationError('An unexpected error occurred during verification.');
        }
      }
    };

    handleAuthCallback();
  }, [searchParams, navigate, toast]);

  // Redirect authenticated users to home
  useEffect(() => {
    if (user && verificationStatus === 'idle') {
      navigate('/');
    }
  }, [user, navigate, verificationStatus]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { error } = await signUp(email, password, fullName);
      
      if (error) {
        if (error.message.includes('User already registered')) {
          setError('An account with this email already exists. Please sign in instead.');
        } else {
          setError(error.message);
        }
      } else {
        setShowEmailSent(true);
        toast({
          title: "Check your email",
          description: "We've sent you a verification link to confirm your account.",
        });
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    }

    setIsLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setError('Please check your email and click the verification link before signing in.');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Welcome back!",
          description: "You've successfully signed in to your camera control system.",
        });
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    }

    setIsLoading(false);
  };

  const handleResend = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.toLowerCase().trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth` }
      } as any);
      if (error) {
        setError(error.message || 'Could not resend verification email. Please try again.');
      } else {
        toast({
          title: 'Verification email resent',
          description: `We’ve resent the verification link to ${email}.`,
        });
      }
    } catch (err: any) {
      setError('Unexpected error while resending verification email.');
    }
    setIsLoading(false);
  };

  // Show verification processing state
  if (verificationStatus === 'processing') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
            <CardTitle className="text-white">Verifying Your Account</CardTitle>
            <CardDescription className="text-gray-300">
              Please wait while we verify your email...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show verification success state
  if (verificationStatus === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-white">Email Verified!</CardTitle>
            <CardDescription className="text-gray-300">
              Your account has been verified successfully. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show verification error state
  if (verificationStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-white">Verification Failed</CardTitle>
            <CardDescription className="text-gray-300">
              {verificationError}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-400 mb-4">
              The verification link may have expired or already been used. You can request a new verification email.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button 
              className="w-full"
              onClick={() => {
                setVerificationStatus('idle');
                setVerificationError('');
                setShowEmailSent(true);
                // Clear URL params
                window.history.replaceState(null, '', '/auth');
              }}
            >
              Request New Verification Email
            </Button>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => {
                setVerificationStatus('idle');
                setVerificationError('');
                window.history.replaceState(null, '', '/auth');
              }}
            >
              Back to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (showEmailSent) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-white">Check Your Email</CardTitle>
            <CardDescription className="text-gray-300">
              We've sent a verification link to {email}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="space-y-4">
              <Alert className="bg-blue-600/20 border-blue-600">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-blue-200">
                  Please click the verification link in your email to activate your account and access your camera control system.
                </AlertDescription>
              </Alert>
              <p className="text-sm text-gray-400">
                Didn't receive the email? Check your spam folder or try signing up again.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button 
              className="w-full"
              onClick={handleResend}
              disabled={isLoading}
            >
              {isLoading ? 'Resending...' : 'Resend verification email'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => setShowEmailSent(false)}
            >
              Back to Sign Up
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-white">CamAlert</CardTitle>
          <CardDescription className="text-gray-300">
            Secure access to your remote camera system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-700">
              <TabsTrigger value="signin" className="text-gray-300">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-gray-300">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-300">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-gray-300">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-gray-300">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-gray-300">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </Button>
                <p className="text-xs text-gray-400 text-center">
                  You'll receive an email to verify your account before you can sign in.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
