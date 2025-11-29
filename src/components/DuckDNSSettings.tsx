
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, RefreshCw, CheckCircle, AlertCircle, Wifi, Save, Copy } from 'lucide-react';
import { useDuckDNS } from '@/hooks/useDuckDNS';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const DuckDNSSettings = () => {
  const {
    config,
    currentIP,
    isUpdating,
    lastUpdate,
    error,
    updateConfig,
    checkAndUpdateIP,
    manualUpdate,
    getCameraUrlWithDuckDNS
  } = useDuckDNS();

  const [token, setToken] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);
  const { toast } = useToast();

  const saveToken = async () => {
    if (!token.trim()) {
      toast({
        title: "Error",
        description: "Please enter a DuckDNS token",
        variant: "destructive"
      });
      return;
    }

    setIsSavingToken(true);
    try {
      const { error } = await supabase.functions.invoke('save-duckdns-token', {
        body: { token: token.trim() }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Success",
        description: "DuckDNS token saved securely"
      });
      setToken('');
    } catch (error) {
      console.error('Error saving token:', error);
      toast({
        title: "Error", 
        description: "Failed to save DuckDNS token",
        variant: "destructive"
      });
    } finally {
      setIsSavingToken(false);
    }
  };

  const copyCameraUrl = (port: number) => {
    const url = getCameraUrlWithDuckDNS(port);
    if (url) {
      navigator.clipboard.writeText(url);
      toast({
        title: "Copied!",
        description: "Camera URL copied to clipboard"
      });
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Globe className="w-5 h-5" />
          DuckDNS Dynamic IP
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-gray-300">Enable DuckDNS</Label>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => updateConfig({ enabled })}
          />
        </div>

        {config.enabled && (
          <>
            <div className="space-y-2">
              <Label className="text-gray-300">DuckDNS Domain</Label>
              <Input
                value={config.domain}
                onChange={(e) => updateConfig({ domain: e.target.value })}
                placeholder="yourdomain.duckdns.org"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Manual IP Override (Optional)</Label>
              <Input
                value={config.manualIP || ''}
                onChange={(e) => updateConfig({ manualIP: e.target.value })}
                placeholder="82.49.10.84 (leave empty for auto-detection)"
                className="bg-gray-700 border-gray-600 text-white"
              />
              <p className="text-xs text-gray-400">
                Enter your router's actual public IP address to override automatic detection
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">DuckDNS Token</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your DuckDNS token to update it"
                  className="bg-gray-700 border-gray-600 text-white"
                />
                <Button
                  onClick={saveToken}
                  disabled={isSavingToken || !token.trim()}
                  className="bg-green-600 hover:bg-green-700"
                  title="Save DuckDNS token"
                >
                  <Save className={`w-4 h-4 ${isSavingToken ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Your token is stored securely on the server and never exposed to the browser
              </p>
            </div>

            {config.domain && (
              <div className="space-y-2">
                <Label className="text-gray-300">Camera URLs</Label>
                <div className="bg-gray-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Port 8000 (Stream):</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyCameraUrl(8000)}
                      className="bg-gray-600 border-gray-500 hover:bg-gray-500"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <code className="text-xs text-blue-300 break-all block">
                    {getCameraUrlWithDuckDNS(8000)}
                  </code>
                </div>
                <p className="text-xs text-yellow-400">
                  ⚠️ Note: These URLs use HTTP and will be proxied through HTTPS when accessed from this site
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300">Current Status</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={checkAndUpdateIP}
                    disabled={isUpdating}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Wifi className={`w-4 h-4 mr-1 ${isUpdating ? 'animate-spin' : ''}`} />
                    Check IP
                  </Button>
                  <Button
                    size="sm"
                    onClick={manualUpdate}
                    disabled={isUpdating}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${isUpdating ? 'animate-spin' : ''}`} />
                    Update Now
                  </Button>
                </div>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-3 space-y-2">
                {currentIP && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">Current IP: {currentIP}</span>
                  </div>
                )}
                
                {lastUpdate && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">
                      Last Updated: {lastUpdate.toLocaleString()}
                    </span>
                  </div>
                )}
                
                {error && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
                    <div className="text-red-400">
                      <div className="font-medium">Error:</div>
                      <div className="text-xs opacity-90">{error}</div>
                    </div>
                  </div>
                )}
                
                {isUpdating && (
                  <div className="flex items-center gap-2 text-sm">
                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    <span className="text-blue-400">Updating...</span>
                  </div>
                )}

                {!currentIP && !error && !isUpdating && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-gray-300">IP not detected yet</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-400 space-y-1">
              <p>• IP is checked every 5 minutes automatically</p>
              <p>• Use your DuckDNS domain in camera URLs for external access</p>
              <p>• HTTP URLs are automatically proxied through HTTPS for security</p>
              <p>• All tokens are stored securely on the server</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
