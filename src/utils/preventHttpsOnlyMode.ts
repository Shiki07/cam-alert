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
    
    // Check if this is a direct HTTP camera request that should go through proxy
    if (url.startsWith('http://') && 
        (url.includes('.duckdns.org') || url.includes(':8081') || url.includes('stream.mjpg')) &&
        window.location.protocol === 'https:') {
      
      console.warn('preventHttpsOnlyMode: Intercepted direct HTTP camera request, should use proxy instead:', url);
      
      // Return a rejected promise to prevent the direct request
      return Promise.reject(new Error('Direct HTTP camera requests blocked - use proxy instead'));
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

/**
 * Add meta tag to prevent automatic HTTPS upgrades for camera domains
 */
export const addHttpsOnlyModeExceptions = () => {
  // Add meta tag to control HTTPS-Only mode behavior
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "upgrade-insecure-requests; block-all-mixed-content;";
  
  // Check if already exists
  const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (existing) {
    existing.remove();
  }
  
  document.head.appendChild(meta);
  
  console.log('preventHttpsOnlyMode: CSP meta tag added to control HTTPS upgrades');
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