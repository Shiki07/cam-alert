
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let subscription: any;

    const initializeAuth = async () => {
      try {
        // SECURITY: Enhanced environment detection
        const isRestrictedEnvironment = window.location !== window.parent.location || 
                                      window.location.protocol === 'file:' ||
                                      window.location.hostname === 'localhost' && window.location.port === '3000';
        
        if (isRestrictedEnvironment) {
          console.log('Running in restricted environment, using fallback auth initialization');
        }

        // Try to get initial session with timeout
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 5000)
        );

        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any;
        
        if (error) {
          console.error('Error getting session:', error);
        }
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
        }

        // Set up auth state listener with error handling
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            console.log('Auth state changed:', event, session?.user?.email);
            
            // SECURITY: Validate session before setting state
            if (session) {
              const now = Math.floor(Date.now() / 1000);
              if (session.expires_at && session.expires_at < now) {
                console.warn('Received expired session, ignoring');
                return;
              }
            }
            
            if (mounted) {
              setSession(session);
              setUser(session?.user ?? null);
            }
          }
        );
        subscription = authSubscription;

      } catch (error) {
        console.error('Error initializing auth:', error);
        // In case of any errors, set secure defaults
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (subscription) {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.error('Error unsubscribing:', error);
        }
      }
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      // SECURITY: Input validation
      if (!email || !password || !fullName) {
        return { error: { message: 'All fields are required' } };
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { error: { message: 'Please enter a valid email address' } };
      }

      // Password strength validation
      if (password.length < 8) {
        return { error: { message: 'Password must be at least 8 characters long' } };
      }

      // Sanitize full name
      const sanitizedFullName = fullName.trim().replace(/[<>'"&]/g, '');
      if (sanitizedFullName.length < 2) {
        return { error: { message: 'Please enter a valid full name' } };
      }

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: sanitizedFullName,
          }
        }
      });
      return { error };
    } catch (error) {
      console.error('Error in signUp:', error);
      return { error: { message: 'An unexpected error occurred during sign up' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // SECURITY: Input validation
      if (!email || !password) {
        return { error: { message: 'Email and password are required' } };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      return { error };
    } catch (error) {
      console.error('Error in signIn:', error);
      return { error: { message: 'An unexpected error occurred during sign in' } };
    }
  };

  const signOut = async () => {
    try {
      // SECURITY: Clear local state immediately
      setUser(null);
      setSession(null);
      
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error in signOut:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
