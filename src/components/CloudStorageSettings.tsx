import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Cloud, Key, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CloudProvider, CloudStorageConfig, AuthMethod } from '@/services/cloudStorage/types';
import { CloudStorageFactory } from '@/services/cloudStorage/CloudStorageFactory';

export const CloudStorageSettings = () => {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>('none');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth');
  const [isConfigured, setIsConfigured] = useState(false);
  
  // OAuth state
  const [oauthToken, setOauthToken] = useState('');
  
  // API Key state
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [region, setRegion] = useState('us-east-1');

  useEffect(() => {
    // Load saved configuration from localStorage
    const savedConfig = localStorage.getItem('cloudStorageConfig');
    if (savedConfig) {
      try {
        const config: CloudStorageConfig = JSON.parse(savedConfig);
        setSelectedProvider(config.provider);
        setAuthMethod(config.authMethod);
        if (config.authMethod === 'oauth') {
          setOauthToken(config.credentials?.accessToken || '');
        } else {
          setApiKey(config.credentials?.apiKey || '');
          setApiSecret(config.credentials?.apiSecret || '');
          setBucketName(config.credentials?.bucketName || '');
          setRegion(config.credentials?.region || 'us-east-1');
        }
        checkConfiguration(config);
      } catch (error) {
        console.error('Failed to load cloud storage config:', error);
      }
    }
  }, []);

  const checkConfiguration = async (config: CloudStorageConfig) => {
    const provider = CloudStorageFactory.getProvider(config.provider);
    if (provider) {
      const configured = await provider.configure(config);
      setIsConfigured(configured);
    }
  };

  const handleSaveConfiguration = async () => {
    if (selectedProvider === 'none') {
      toast({
        title: "No provider selected",
        description: "Please select a cloud storage provider",
        variant: "destructive"
      });
      return;
    }

    const config: CloudStorageConfig = {
      provider: selectedProvider,
      authMethod,
      credentials: authMethod === 'oauth' 
        ? { accessToken: oauthToken }
        : { 
            apiKey, 
            apiSecret, 
            bucketName: selectedProvider === 's3' ? bucketName : undefined,
            region: selectedProvider === 's3' ? region : undefined
          }
    };

    try {
      const provider = CloudStorageFactory.getProvider(selectedProvider);
      if (!provider) {
        throw new Error('Provider not supported');
      }

      const configured = await provider.configure(config);
      if (configured) {
        localStorage.setItem('cloudStorageConfig', JSON.stringify(config));
        setIsConfigured(true);
        toast({
          title: "Configuration saved",
          description: `${provider.name} is now configured and ready to use`
        });
      } else {
        throw new Error('Configuration validation failed');
      }
    } catch (error) {
      toast({
        title: "Configuration failed",
        description: error instanceof Error ? error.message : "Could not save configuration",
        variant: "destructive"
      });
    }
  };

  const handleConnectOAuth = () => {
    const provider = CloudStorageFactory.getProvider(selectedProvider);
    if (provider && 'getAuthUrl' in provider && provider.getAuthUrl) {
      const authUrl = provider.getAuthUrl();
      window.open(authUrl, '_blank', 'width=600,height=800');
      
      toast({
        title: "Authorization required",
        description: "Please complete the authorization in the new window, then paste your access token here"
      });
    }
  };

  const providers = CloudStorageFactory.getSupportedProviders();

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Cloud Storage Configuration
        </CardTitle>
        <CardDescription>
          Connect your own cloud storage account for recordings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <Label className="text-foreground">Cloud Provider</Label>
          <Select value={selectedProvider} onValueChange={(value) => setSelectedProvider(value as CloudProvider)}>
            <SelectTrigger className="bg-background border-border text-foreground">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Local only)</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProvider !== 'none' && (
          <>
            {/* Auth Method Selection */}
            <div className="space-y-2">
              <Label className="text-foreground">Authentication Method</Label>
              <div className="flex gap-2">
                {providers
                  .find(p => p.id === selectedProvider)
                  ?.authMethods.includes('oauth') && (
                  <Button
                    variant={authMethod === 'oauth' ? 'default' : 'outline'}
                    onClick={() => setAuthMethod('oauth')}
                    className="flex-1"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    OAuth
                  </Button>
                )}
                {providers
                  .find(p => p.id === selectedProvider)
                  ?.authMethods.includes('api-key') && (
                  <Button
                    variant={authMethod === 'api-key' ? 'default' : 'outline'}
                    onClick={() => setAuthMethod('api-key')}
                    className="flex-1"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    API Keys
                  </Button>
                )}
              </div>
            </div>

            {/* OAuth Configuration */}
            {authMethod === 'oauth' && (
              <div className="space-y-3">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Click "Connect" to authorize access to your {providers.find(p => p.id === selectedProvider)?.name} account
                  </AlertDescription>
                </Alert>
                <Button 
                  onClick={handleConnectOAuth}
                  variant="outline"
                  className="w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect to {providers.find(p => p.id === selectedProvider)?.name}
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="oauthToken" className="text-foreground">Access Token (paste here after authorization)</Label>
                  <Input
                    id="oauthToken"
                    type="password"
                    placeholder="Paste your access token"
                    value={oauthToken}
                    onChange={(e) => setOauthToken(e.target.value)}
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>
            )}

            {/* API Key Configuration */}
            {authMethod === 'api-key' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="text-foreground">API Key / Access Key ID</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiSecret" className="text-foreground">API Secret / Secret Access Key</Label>
                  <Input
                    id="apiSecret"
                    type="password"
                    placeholder="Enter your API secret"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                {selectedProvider === 's3' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bucketName" className="text-foreground">S3 Bucket Name</Label>
                      <Input
                        id="bucketName"
                        placeholder="my-recordings-bucket"
                        value={bucketName}
                        onChange={(e) => setBucketName(e.target.value)}
                        className="bg-background border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="region" className="text-foreground">AWS Region</Label>
                      <Input
                        id="region"
                        placeholder="us-east-1"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="bg-background border-border text-foreground"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <Badge variant={isConfigured ? "default" : "secondary"} className="gap-1">
                {isConfigured ? (
                  <>
                    <Check className="w-3 h-3" />
                    Configured
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    Not Configured
                  </>
                )}
              </Badge>
            </div>

            {/* Save Button */}
            <Button 
              onClick={handleSaveConfiguration}
              className="w-full"
            >
              Save Configuration
            </Button>
          </>
        )}

        {/* Info Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Your cloud storage credentials are stored locally in your browser and used only for uploading recordings.
            {selectedProvider === 's3' && ' Note: S3 uploads require additional edge function configuration for security.'}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
