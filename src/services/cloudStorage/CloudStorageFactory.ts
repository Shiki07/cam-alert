import { CloudProvider, CloudStorageProvider } from './types';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider';
import { DropboxProvider } from './providers/DropboxProvider';
import { OneDriveProvider } from './providers/OneDriveProvider';
import { S3Provider } from './providers/S3Provider';

export class CloudStorageFactory {
  private static providers: Map<CloudProvider, CloudStorageProvider> = new Map();

  static getProvider(provider: CloudProvider): CloudStorageProvider | null {
    if (provider === 'none') return null;

    if (!this.providers.has(provider)) {
      const instance = this.createProvider(provider);
      if (instance) {
        this.providers.set(provider, instance);
      }
    }

    return this.providers.get(provider) || null;
  }

  private static createProvider(provider: CloudProvider): CloudStorageProvider | null {
    switch (provider) {
      case 'google-drive':
        return new GoogleDriveProvider();
      case 'dropbox':
        return new DropboxProvider();
      case 'onedrive':
        return new OneDriveProvider();
      case 's3':
        return new S3Provider();
      default:
        return null;
    }
  }

  static getSupportedProviders(): Array<{ id: CloudProvider; name: string; authMethods: string[] }> {
    return [
      { id: 'google-drive', name: 'Google Drive', authMethods: ['oauth'] },
      { id: 'dropbox', name: 'Dropbox', authMethods: ['oauth'] },
      { id: 'onedrive', name: 'Microsoft OneDrive', authMethods: ['oauth'] },
      { id: 's3', name: 'Amazon S3', authMethods: ['api-key'] }
    ];
  }
}
