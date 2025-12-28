import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Cloud, Check, Shield } from 'lucide-react';

export const CloudStorageSettings = () => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Cloud Storage
        </CardTitle>
        <CardDescription>
          Your recordings are securely stored in Supabase Storage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="default" className="gap-1 bg-green-600">
            <Check className="w-3 h-3" />
            Connected
          </Badge>
          <span className="text-sm text-muted-foreground">Supabase Storage</span>
        </div>

        {/* Features List */}
        <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium text-foreground">Secure by Default</div>
              <div className="text-sm text-muted-foreground">
                Row-level security ensures only you can access your recordings
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Cloud className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <div className="font-medium text-foreground">Automatic Storage</div>
              <div className="text-sm text-muted-foreground">
                No additional configuration needed - your recordings are automatically saved
              </div>
            </div>
          </div>
        </div>

        {/* Info Alert */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Your recordings are stored in a private bucket with row-level security. 
            Only authenticated users can access their own files.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
