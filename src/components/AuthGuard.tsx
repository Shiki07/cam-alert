
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  console.log('AuthGuard - user:', user?.email, 'loading:', loading);

  useEffect(() => {
    console.log('AuthGuard useEffect - user:', user?.email, 'loading:', loading);
    
    if (!loading && !user) {
      console.log('Redirecting to auth page');
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Show loading state while checking auth
  if (loading) {
    console.log('Showing loading state');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading your camera system...</div>
      </div>
    );
  }

  // Show auth prompt if not authenticated
  if (!user) {
    console.log('Showing auth prompt');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-6 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">CamAlert</h1>
          <p className="text-gray-300 mb-6">
            Secure remote camera control and monitoring system
          </p>
          <Button onClick={() => navigate("/auth")} className="bg-blue-600 hover:bg-blue-700">
            Sign In to Access Camera
          </Button>
        </div>
      </div>
    );
  }

  console.log('Showing main dashboard for user:', user.email);
  return <>{children}</>;
};
