
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, RefreshCw, CheckCircle, AlertCircle, Wifi } from 'lucide-react';
import { useDuckDNS } from '@/hooks/useDuckDNS';

export const DuckDNSSettings = () => {
  const {
    config,
    currentIP,
    isUpdating,
    lastUpdate,
    error,
    updateConfig,
    checkAndUpdateIP,
    manualUpdate
  } = useDuckDNS();

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
              <Label className="text-gray-300">DuckDNS Token</Label>
              <Input
                type="password"
                value={config.token}
                onChange={(e) => updateConfig({ token: e.target.value })}
                placeholder="Your DuckDNS token"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>

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
                      {error.includes('IP address') && (
                        <div className="text-xs opacity-75 mt-1">
                          This may be due to browser security restrictions. Try disabling content blocking or using a different browser.
                        </div>
                      )}
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
              <p>• IP is checked every 10 minutes automatically</p>
              <p>• Use your DuckDNS domain in camera URLs: {config.domain}:8081</p>
              <p>• Browser security may block IP detection - manual updates available</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
