import { CloudStorageProvider, CloudStorageConfig, UploadResult, DownloadResult, DeleteResult } from '../types';

export class GoogleDriveProvider implements CloudStorageProvider {
  readonly name = 'Google Drive';
  readonly provider = 'google-drive' as const;
  
  private config: CloudStorageConfig | null = null;
  private readonly CLIENT_ID = ''; // User will configure
  private readonly SCOPES = ['https://www.googleapis.com/auth/drive.file'];

  async configure(config: CloudStorageConfig): Promise<boolean> {
    this.config = config;
    
    if (config.authMethod === 'oauth' && config.credentials?.accessToken) {
      // Validate token
      try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {
            'Authorization': `Bearer ${config.credentials.accessToken}`
          }
        });
        return response.ok;
      } catch {
        return false;
      }
    }
    
    return false;
  }

  isConfigured(): boolean {
    return this.config !== null && 
           this.config.authMethod === 'oauth' && 
           !!this.config.credentials?.accessToken;
  }

  getAuthUrl(): string {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    });
    
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleAuthCallback(code: string): Promise<boolean> {
    // This would be handled by an edge function for security
    return false;
  }

  async upload(blob: Blob, filename: string, path?: string): Promise<UploadResult> {
    if (!this.isConfigured() || !this.config?.credentials?.accessToken) {
      return { success: false, error: 'Not configured' };
    }

    try {
      // Create metadata
      const metadata = {
        name: filename,
        mimeType: blob.type,
        parents: path ? [path] : []
      };

      // Upload file using multipart upload
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`
        },
        body: form
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        fileId: data.id,
        filePath: data.name,
        publicUrl: `https://drive.google.com/file/d/${data.id}/view`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  async download(fileId: string): Promise<DownloadResult> {
    if (!this.isConfigured() || !this.config?.credentials?.accessToken) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      return { success: true, blob };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  async delete(fileId: string): Promise<DeleteResult> {
    if (!this.isConfigured() || !this.config?.credentials?.accessToken) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed'
      };
    }
  }
}
