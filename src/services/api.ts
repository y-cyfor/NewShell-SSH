import axios from 'axios';

function getBaseUrl(): string {
  return localStorage.getItem('newshell_sync_url') || 'http://localhost:29800';
}

const api = axios.create({
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  const token = localStorage.getItem('newshell_sync_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('newshell_sync_token');
      localStorage.removeItem('newshell_sync_user');
    }
    return Promise.reject(error);
  }
);

export default api;
export { getBaseUrl };
