
import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';
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
        <h1 className="text-2xl font-bold text-white">CamAlert Control Panel</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-300">
            <User className="w-4 h-4" />
            <span className="text-sm">{user.email}</span>
          </div>
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
