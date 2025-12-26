import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStreamViewer } from '@/hooks/useStreamRelay';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Radio, WifiOff, RefreshCw, Lock } from 'lucide-react';

const RemoteViewer: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [retryCount, setRetryCount] = useState(0);

  const { frameUrl, status, hostName } = useStreamViewer({ 
    roomId: roomId || null, 
    enabled: true 
  });

  // Retry on error
  useEffect(() => {
    if (status === 'error' && retryCount < 3) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, retryCount]);

  const handleRetry = () => {
    setRetryCount(0);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          {status === 'streaming' && (
            <div className="flex items-center gap-2 text-green-500">
              <Radio className="h-4 w-4 animate-pulse" />
              <span className="text-sm font-medium">LIVE</span>
            </div>
          )}

          {hostName && (
            <span className="text-sm text-muted-foreground">
              Host: {hostName}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            {/* Video frame */}
            {frameUrl && status !== 'ended' ? (
              <img
                src={frameUrl}
                alt="Live stream"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                {status === 'connecting' && (
                  <>
                    <RefreshCw className="h-12 w-12 mb-4 animate-spin" />
                    <p className="text-lg">Connecting to stream...</p>
                  </>
                )}
                
                {status === 'error' && (
                  <>
                    <WifiOff className="h-12 w-12 mb-4 text-yellow-500" />
                    <p className="text-lg mb-4">Connection lost</p>
                    <Button onClick={handleRetry} variant="outline">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </>
                )}
                
                {status === 'ended' && (
                  <>
                    <WifiOff className="h-12 w-12 mb-4" />
                    <p className="text-lg mb-2">Stream has ended</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      The host has stopped streaming
                    </p>
                    <Button onClick={() => navigate('/')} variant="outline">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Go to Dashboard
                    </Button>
                  </>
                )}
                
                {status === 'unauthorized' && (
                  <>
                    <Lock className="h-12 w-12 mb-4 text-yellow-500" />
                    <p className="text-lg mb-2">Access Denied</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      You need to be logged in and have permission to view this stream
                    </p>
                    <Button onClick={() => navigate('/auth')} variant="outline">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Sign In
                    </Button>
                  </>
                )}

                {status === 'idle' && !roomId && (
                  <>
                    <WifiOff className="h-12 w-12 mb-4" />
                    <p className="text-lg">No stream selected</p>
                  </>
                )}
              </div>
            )}

            {/* Live indicator overlay */}
            {status === 'streaming' && (
              <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                LIVE
              </div>
            )}
          </div>

          {/* Stream info */}
          {roomId && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Room: {roomId}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RemoteViewer;
