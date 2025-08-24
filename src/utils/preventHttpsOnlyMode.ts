/**
 * Utility to prevent HTTPS-Only mode from interfering with camera proxy
 * This helps ensure all HTTP camera requests go through our secure proxy
 */

export const preventHttpsOnlyModeInterference = () => {
  // Override the global fetch function to intercept and redirect camera requests
  const originalFetch = window.fetch;
  
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : 
                input instanceof URL ? input.href : 
                input.url;
    
    // Check if this is a direct HTTP camera request while app is served over HTTPS
    if (url.startsWith('http://') && window.location.protocol === 'https:') {
      try {
        const u = new URL(url);
        const host = u.hostname;
        const isLocal = (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host.startsWith('192.168.') ||
          host.startsWith('10.') ||
          (host.startsWith('172.') && (() => { const s = parseInt(host.split('.')[1] || '0'); return s >= 16 && s <= 31; })())
        );
        
        if (!isLocal) {
          console.warn('preventHttpsOnlyMode: Intercepted direct HTTP camera request to public host, use proxy:', url);
          return Promise.reject(new Error('Direct HTTP camera requests blocked - use proxy instead'));
        }
      } catch (_) {
        // If parsing fails, be conservative and block
        console.warn('preventHttpsOnlyMode: Could not parse URL, blocking to enforce proxy');
        return Promise.reject(new Error('Direct HTTP camera requests blocked - use proxy instead'));
      }
    }
    
    // For all other requests, use the original fetch
    return originalFetch.call(this, input, init);
  };
  
  console.log('preventHttpsOnlyMode: HTTP camera request interception enabled');
};

export const restoreOriginalFetch = () => {
  // This would restore the original fetch if needed
  // Implementation depends on how we store the original reference
  console.log('preventHttpsOnlyMode: Would restore original fetch (not implemented)');
};

export const addHttpsOnlyModeExceptions = () => {
  // Remove any CSP meta that forces HTTPS upgrades or blocks mixed content
  const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (existing) {
    existing.remove();
    console.log('preventHttpsOnlyMode: Removed existing CSP meta to allow local HTTP camera access');
  } else {
    console.log('preventHttpsOnlyMode: No CSP meta present, leaving as-is');
  }
};

/**
 * Initialize all HTTPS-Only mode prevention measures
 */
export const initializeHttpsOnlyModePrevention = () => {
  try {
    preventHttpsOnlyModeInterference();
    addHttpsOnlyModeExceptions();
    
    console.log('preventHttpsOnlyMode: All prevention measures initialized');
  } catch (error) {
    console.error('preventHttpsOnlyMode: Failed to initialize prevention measures:', error);
  }
};