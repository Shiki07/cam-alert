import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Wifi, Plus, Trash2, TestTube, Globe, Stethoscope, RefreshCw } from 'lucide-react';
import { NetworkCameraConfig } from '@/hooks/useNetworkCamera';
import { supabase } from '@/integrations/supabase/client';
import { useDuckDNS } from '@/hooks/useDuckDNS';
import { useToast } from '@/hooks/use-toast';

export type CameraSource = 'webcam' | 'network';

interface CameraSourceSelectorProps {
  currentSource: CameraSource;
  onSourceChange: (source: CameraSource) => void;
  networkCameras: NetworkCameraConfig[];
  onAddNetworkCamera: (config: NetworkCameraConfig) => void | Promise<void>;
  onRemoveNetworkCamera: (index: number) => void | Promise<void>;
  onConnectNetworkCamera: (config: NetworkCameraConfig) => void;
  onTestConnection: (config: NetworkCameraConfig) => Promise<boolean>;
  selectedNetworkCamera: NetworkCameraConfig | null;
}

export const CameraSourceSelector = ({
  currentSource,
  onSourceChange,
  networkCameras,
  onAddNetworkCamera,
  onRemoveNetworkCamera,
  onConnectNetworkCamera,
  onTestConnection,
  selectedNetworkCamera
}: CameraSourceSelectorProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCamera, setNewCamera] = useState<Partial<NetworkCameraConfig>>({
    type: 'mjpeg',
    name: '',
    url: ''
  });
  const [testingConnections, setTestingConnections] = useState<Set<number>>(new Set());
  const [connectingCameras, setConnectingCameras] = useState<Set<number>>(new Set());
  const [runningDiagnostics, setRunningDiagnostics] = useState<Set<number>>(new Set());
  const [diagnosticsResults, setDiagnosticsResults] = useState<{[key: number]: any}>({});
  
  const { getDuckDNSUrl, config } = useDuckDNS();
  const { toast } = useToast();

  const runDiagnostics = async (camera: NetworkCameraConfig, index: number) => {
    setRunningDiagnostics(prev => new Set(prev).add(index));
    
    try {
      const { data, error } = await supabase.functions.invoke('camera-diagnostics', {
        body: { url: camera.url }
      });
      
      if (error) {
        console.error('Diagnostics error:', error);
        setDiagnosticsResults(prev => ({
          ...prev,
          [index]: { error: error.message }
        }));
      } else {
        console.log('Diagnostics results:', data);
        setDiagnosticsResults(prev => ({
          ...prev,
          [index]: data
        }));
      }
    } catch (err) {
      console.error('Diagnostics failed:', err);
      setDiagnosticsResults(prev => ({
        ...prev,
        [index]: { error: 'Diagnostics failed to run' }
      }));
    } finally {
      setRunningDiagnostics(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleAddCamera = () => {
    if (newCamera.name && newCamera.url && newCamera.type) {
      onAddNetworkCamera(newCamera as NetworkCameraConfig);
      setNewCamera({ type: 'mjpeg', name: '', url: '' });
      setShowAddForm(false);
    }
  };

  const handleTestConnection = async (config: NetworkCameraConfig, index: number) => {
    setTestingConnections(prev => new Set(prev).add(index));
    
    // Show starting toast
    toast({
      title: 'Testing connection...',
      description: `Checking if ${config.name} is reachable`,
    });
    
    try {
      console.log('Starting connection test for:', config.name, config.url);
      const success = await onTestConnection(config);
      console.log(`Connection test ${success ? 'passed' : 'failed'} for ${config.name}`);
      
      toast({
        title: success ? '✅ Connection successful!' : '❌ Connection failed',
        description: success 
          ? `Camera ${config.name} is reachable and responding` 
          : `Could not reach ${config.name}. Check the URL, port forwarding, and firewall settings.`,
        variant: success ? undefined : 'destructive',
        duration: 5000,
      });
    } catch (error) {
      console.error('Test connection error:', error);
      toast({
        title: '❌ Test failed',
        description: `Error testing ${config.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setTestingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleConnectCamera = async (config: NetworkCameraConfig, index: number) => {
    console.log('Connect button clicked for camera:', config.name, config.url);
    setConnectingCameras(prev => new Set(prev).add(index));
    
    try {
      await onConnectNetworkCamera(config);
      console.log('Connection attempt completed for:', config.name);
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setConnectingCameras(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const generateDuckDNSUrl = (port: string = '8000') => {
    const duckUrl = getDuckDNSUrl(parseInt(port));
    if (duckUrl) {
      return `${duckUrl}/stream.mjpg`;
    }
    return '';
  };

  const handleUseDuckDNS = () => {
    const duckUrl = generateDuckDNSUrl();
    if (duckUrl) {
      setNewCamera(prev => ({ ...prev, url: duckUrl }));
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Camera Source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Selection */}
        <div className="space-y-2">
          <Label className="text-gray-300">Source Type</Label>
          <Select value={currentSource} onValueChange={(value: CameraSource) => onSourceChange(value)}>
            <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              <SelectItem value="webcam" className="text-white">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Local Webcam
                </div>
              </SelectItem>
              <SelectItem value="network" className="text-white">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4" />
                  Network Camera
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Network Camera Selection */}
        {currentSource === 'network' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Network Cameras</Label>
              <Button
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-600 hover:bg-blue-700"
                title="Add new network camera"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            {/* Add Camera Form */}
            {showAddForm && (
              <div className="bg-gray-700 rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-gray-300">Camera Name</Label>
                  <Input
                    value={newCamera.name || ''}
                    onChange={(e) => setNewCamera(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Raspberry Pi Camera"
                    className="bg-gray-600 border-gray-500 text-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">Stream Type</Label>
                  <Select 
                    value={newCamera.type} 
                    onValueChange={(value: 'rtsp' | 'mjpeg' | 'hls') => 
                      setNewCamera(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      <SelectItem value="mjpeg" className="text-white">MJPEG Stream</SelectItem>
                      <SelectItem value="hls" className="text-white">HLS Stream</SelectItem>
                      <SelectItem value="rtsp" className="text-white">RTSP (Limited)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Stream URL</Label>
                    {config.enabled && config.domain && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleUseDuckDNS}
                        className="bg-green-700 border-green-600 text-green-100 hover:bg-green-600"
                      >
                        <Globe className="w-3 h-3 mr-1" />
                        Use DuckDNS
                      </Button>
                    )}
                  </div>
                  <Input
                    value={newCamera.url || ''}
                    onChange={(e) => setNewCamera(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="http://192.168.178.108:8000/stream.mjpg"
                    className="bg-gray-600 border-gray-500 text-white"
                  />
                  {config.enabled && config.domain && (
                    <div className="text-xs text-green-400">
                      DuckDNS URL: {generateDuckDNSUrl()}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Username (optional)</Label>
                    <Input
                      value={newCamera.username || ''}
                      onChange={(e) => setNewCamera(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="admin"
                      className="bg-gray-600 border-gray-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">Password (optional)</Label>
                    <Input
                      type="password"
                      value={newCamera.password || ''}
                      onChange={(e) => setNewCamera(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="password"
                      className="bg-gray-600 border-gray-500 text-white"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleAddCamera} className="bg-green-600 hover:bg-green-700">
                    Add Camera
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddForm(false)}
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Camera List */}
            <div className="space-y-2">
              {networkCameras.map((camera, index) => (
                <div key={index} className="space-y-2">
                  <div className="bg-gray-700 rounded-lg p-3 space-y-3">
                    {/* Camera info row */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{camera.name}</span>
                        <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                          {camera.type.toUpperCase()}
                        </span>
                        {camera.url.includes('.duckdns.org') && (
                          <span className="text-xs bg-green-600 text-green-100 px-2 py-1 rounded flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            DuckDNS
                          </span>
                        )}
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runDiagnostics(camera, index)}
                          disabled={runningDiagnostics.has(index)}
                          className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
                          title="Run detailed diagnostics"
                        >
                          <Stethoscope className="w-4 h-4" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestConnection(camera, index)}
                          disabled={testingConnections.has(index)}
                          className="border-gray-600 text-gray-300 hover:bg-gray-600"
                          title="Test camera connection"
                        >
                          {testingConnections.has(index) ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <TestTube className="w-4 h-4" />
                          )}
                        </Button>
                        
                        <Button
                          size="sm"
                          onClick={() => handleConnectCamera(camera, index)}
                          disabled={connectingCameras.has(index)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {connectingCameras.has(index) ? 'Connecting...' : 'Connect'}
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRemoveNetworkCamera(index)}
                          className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                          title="Remove camera"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* URL on separate line with word wrap */}
                    <div className="text-xs text-gray-400 break-all">{camera.url}</div>
                  </div>
                  
                  {/* Diagnostics Results */}
                  {diagnosticsResults[index] && (
                    <div className="bg-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                      {diagnosticsResults[index].error ? (
                        <div className="text-red-400">
                          Error: {diagnosticsResults[index].error}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-white font-medium flex items-center justify-between">
                            <span>Diagnostics Results</span>
                            <span className="text-xs text-gray-400">
                              {diagnosticsResults[index].timestamp && new Date(diagnosticsResults[index].timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          
                          {diagnosticsResults[index].summary && (
                            <div className={`p-2 rounded text-sm ${
                              diagnosticsResults[index].summary.overallSuccess 
                                ? 'bg-green-900 text-green-300' 
                                : 'bg-red-900 text-red-300'
                            }`}>
                              <div className="font-medium">
                                {diagnosticsResults[index].summary.testsPassed}/{diagnosticsResults[index].summary.testsRun} tests passed
                              </div>
                              <div className="mt-1">{diagnosticsResults[index].summary.recommendation}</div>
                            </div>
                          )}
                          
                          {diagnosticsResults[index].tests && (
                            <div className="space-y-1">
                              {diagnosticsResults[index].tests.map((test: any, testIndex: number) => (
                                <div key={testIndex} className="flex items-start gap-2 text-sm">
                                  {(() => {
                                    const isPort80Info = test.name === 'Basic HTTP (Port 80)' && test.message?.includes('informational');
                                    const isDnsWarn = test.name === 'DNS Resolution' && !test.success && diagnosticsResults[index]?.summary?.overallSuccess;
                                    const dotClass = isPort80Info || isDnsWarn ? 'bg-yellow-500' : (test.success ? 'bg-green-500' : 'bg-red-500');
                                    const textClass = isPort80Info || isDnsWarn ? 'text-yellow-400' : (test.success ? 'text-green-400' : 'text-red-400');
                                    return (
                                      <>
                                        <span className={`w-2 h-2 rounded-full mt-2 ${dotClass}`}></span>
                                        <div className="flex-1">
                                          <div className="text-white">{test.name}</div>
                                          <div className={`text-xs ${textClass}`}>
                                            {test.message || test.error}
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {networkCameras.length === 0 && !showAddForm && (
                <div className="text-center text-gray-400 py-4">
                  No network cameras configured
                </div>
              )}
            </div>

            {selectedNetworkCamera && (
              <div className="bg-green-900 border border-green-700 rounded-lg p-3">
                <div className="text-green-400 font-medium">Connected to: {selectedNetworkCamera.name}</div>
                <div className="text-green-300 text-sm">{selectedNetworkCamera.url}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
