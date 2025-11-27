export type CloudProvider = 'google-drive' | 'dropbox' | 'onedrive' | 's3' | 'none';

export type AuthMethod = 'oauth' | 'api-key';

export interface CloudStorageConfig {
  provider: CloudProvider;
  authMethod: AuthMethod;
  credentials?: {
    // For OAuth
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    
    // For API Keys
    apiKey?: string;
    apiSecret?: string;
    
    // S3 specific
    bucketName?: string;
    region?: string;
    endpoint?: string;
  };
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filePath?: string;
  publicUrl?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export interface CloudStorageProvider {
  readonly name: string;
  readonly provider: CloudProvider;
  
  // Initialize with config
  configure(config: CloudStorageConfig): Promise<boolean>;
  
  // Check if provider is ready
  isConfigured(): boolean;
  
  // File operations
  upload(blob: Blob, filename: string, path?: string): Promise<UploadResult>;
  download(fileId: string): Promise<DownloadResult>;
  delete(fileId: string): Promise<DeleteResult>;
  
  // Auth operations
  getAuthUrl?(): string;
  handleAuthCallback?(code: string): Promise<boolean>;
}
