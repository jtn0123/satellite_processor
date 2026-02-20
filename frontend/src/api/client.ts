import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30s default timeout
});

// Attach API key from env if configured
const apiKey = import.meta.env.VITE_API_KEY;
if (apiKey) {
  api.defaults.headers.common['X-API-Key'] = apiKey;
}

// Response interceptor for rate limit (429) feedback
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      const message = seconds
        ? `Rate limited — please wait ${seconds}s before retrying.`
        : 'Too many requests — please slow down.';
      // Attach user-friendly message for consumers
      error.userMessage = message;
    }
    return Promise.reject(error);
  },
);

export default api;
