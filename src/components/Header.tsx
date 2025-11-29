
import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, Github } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Header = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  if (!user) return null;

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-6 py-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-white">RPi CamAlert Control Panel</h1>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-amber-600/20 border border-amber-600/30 rounded-md">
                <span className="text-amber-200 text-sm font-medium">🚧 Under Construction</span>
              </div>
              <div className="px-3 py-1 bg-red-600/20 border border-red-600/30 rounded-md">
                <span className="text-red-200 text-sm font-medium">⚠️ VPN Not Supported for Raspberry Pi</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-300">
            <User className="w-4 h-4" />
            <span className="text-sm">{user.email}</span>
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            asChild
            className="bg-white text-gray-900 hover:bg-gray-100"
          >
            <a 
              href="https://github.com/Shiki07/cam-alert" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </a>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSignOut}
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
