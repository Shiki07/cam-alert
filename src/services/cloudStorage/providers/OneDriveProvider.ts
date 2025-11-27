import { CloudStorageProvider, CloudStorageConfig, UploadResult, DownloadResult, DeleteResult } from '../types';

export class OneDriveProvider implements CloudStorageProvider {
  readonly name = 'Microsoft OneDrive';
  readonly provider = 'onedrive' as const;
  
  private config: CloudStorageConfig | null = null;
  private readonly CLIENT_ID = ''; // User will configure
  private readonly SCOPES = ['Files.ReadWrite', 'offline_access'];

  async configure(config: CloudStorageConfig): Promise<boolean> {
    this.config = config;
    
    if (config.authMethod === 'oauth' && config.credentials?.accessToken) {
      // Validate token
      try {
        const response = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
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
      response_mode: 'query'
    });
    
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async upload(blob: Blob, filename: string, path?: string): Promise<UploadResult> {
    if (!this.isConfigured() || !this.config?.credentials?.accessToken) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const uploadPath = path ? `/${path}/${filename}` : `/${filename}`;
      const encodedPath = encodeURIComponent(uploadPath);
      
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:${encodedPath}:/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.credentials.accessToken}`,
          'Content-Type': blob.type
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
        filePath: data.name,
        publicUrl: data.webUrl
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
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
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
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
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
