import { CloudStorageProvider, CloudStorageConfig, UploadResult, DownloadResult, DeleteResult } from '../types';

export class DropboxProvider implements CloudStorageProvider {
  readonly name = 'Dropbox';
  readonly provider = 'dropbox' as const;
  
  private config: CloudStorageConfig | null = null;
  private readonly APP_KEY = ''; // User will configure

  async configure(config: CloudStorageConfig): Promise<boolean> {
    this.config = config;
    
    if (config.authMethod === 'oauth' && config.credentials?.accessToken) {
      // Validate token
      try {
        const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.credentials.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: 'null'
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
      client_id: this.APP_KEY,
      redirect_uri: redirectUri,
      response_type: 'code',
      token_access_type: 'offline'
    });
    
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  async upload(blob: Blob, filename: string, path?: string): Promise<UploadResult> {
    if (!this.isConfigured() || !this.config?.credentials?.accessToken) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const fullPath = path ? `/${path}/${filename}` : `/${filename}`;
      
      const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: fullPath,
            mode: 'add',
            autorename: true,
            mute: false
          })
        },
        body: blob
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        fileId: data.id,
        filePath: data.path_display
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
      const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: fileId
          })
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
      const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: fileId
        })
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
