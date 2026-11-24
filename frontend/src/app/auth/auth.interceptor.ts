import { HttpInterceptorFn } from '@angular/common/http';

const API_URL = 'http://localhost:3000';

/**
 * Adjunta el token JWT a las peticiones dirigidas a nuestra API.
 * Se excluyen recursos externos (por ejemplo las teselas satelitales de ESRI)
 * para no filtrar el token a terceros ni provocar preflight CORS.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('access_token');

  if (!token || !req.url.startsWith(API_URL)) {
    return next(req);
  }

  const peticionAutenticada = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(peticionAutenticada);
};
