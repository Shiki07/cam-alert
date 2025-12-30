
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, Github, Menu, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LowPowerModeToggle } from './LowPowerModeToggle';

const Header = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  if (!user) return null;

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      {/* Desktop Layout */}
      <div className="hidden md:flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl lg:text-2xl font-bold text-white">RPi CamAlert</h1>
            <div className="px-2 py-1 bg-red-600/20 border border-red-600/30 rounded-md">
              <span className="text-red-200 text-xs font-medium">⚠️ VPN Not Supported for Raspberry Pi</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LowPowerModeToggle compact />
          <div className="flex items-center gap-2 text-gray-300">
            <User className="w-4 h-4" />
            <span className="text-sm truncate max-w-[150px]">{user.email}</span>
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

      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-white">RPi CamAlert</h1>
            <div className="px-2 py-0.5 bg-red-600/20 border border-red-600/30 rounded text-xs text-red-200 mt-1">
              ⚠️ VPN Not Supported for Pi
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LowPowerModeToggle compact />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-300 p-2"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
            <div className="flex items-center gap-2 text-gray-300 px-1">
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{user.email}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                asChild
                className="bg-white text-gray-900 hover:bg-gray-100 w-full justify-start"
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
                className="text-gray-300 border-gray-600 hover:bg-gray-700 w-full justify-start"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
