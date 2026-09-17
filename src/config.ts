const productionApiOrigin = 'https://raja-store.onrender.com'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  (import.meta.env.PROD ? productionApiOrigin : 'http://localhost:5000')
).replace(/\/$/, '')
