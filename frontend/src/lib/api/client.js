/**
 * Central API Client with JWT and Tenant Context scoping
 */

const API_BASE = '/api/v1';

class ApiError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('julley_token');
  const activeTenantId = localStorage.getItem('julley_active_tenant_id');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
    ...options.headers,
  };

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new ApiError(`HTTP Error ${response.status}`, response.status, 'UNKNOWN_ERROR');
    }
    return null;
  }

  if (!response.ok) {
    // Unpack backend AppError / ZodError format
    let errorMessage = data?.error?.message || data?.message || 'Request failed';
    const errorCode = data?.error?.code || 'ERROR';
    const errorDetails = data?.error?.details || null;

    if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
      const specificMessages = errorDetails.map((d) => d.message).filter(Boolean);
      if (specificMessages.length > 0 && (!errorMessage || errorMessage === 'Request payload validation failed')) {
        errorMessage = specificMessages.join('. ');
      }
    }

    // Handle token expiry or unauthorized
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      localStorage.removeItem('julley_token');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    throw new ApiError(errorMessage, response.status, errorCode, errorDetails);
  }

  return data;
}

export const api = {
  get: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, bodyOrOptions, maybeOptions) => {
    let options = {};
    if (maybeOptions) {
      options = { ...maybeOptions, body: bodyOrOptions };
    } else if (bodyOrOptions && (bodyOrOptions.body || bodyOrOptions.headers)) {
      options = bodyOrOptions;
    } else if (bodyOrOptions) {
      options = { body: bodyOrOptions };
    }
    return apiRequest(endpoint, { ...options, method: 'DELETE' });
  },
};
