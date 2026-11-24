import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

const API_URL = 'http://localhost:3000';
const CLAVE_TOKEN = 'access_token';
const CLAVE_USUARIO = 'usuario';

export interface UsuarioSesion {
  id: string;
  nombreUsuario: string;
  rol: string;
}

export interface RespuestaLogin {
  access_token: string;
  usuario: UsuarioSesion;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  /** Llama al backend y, si es correcto, guarda el token y los datos del usuario. */
  login(nombreUsuario: string, contrasena: string): Observable<RespuestaLogin> {
    return this.http
      .post<RespuestaLogin>(`${API_URL}/auth/login`, { nombreUsuario, contrasena })
      .pipe(
        tap((respuesta) => {
          localStorage.setItem(CLAVE_TOKEN, respuesta.access_token);
          localStorage.setItem(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
        }),
      );
  }

  obtenerToken(): string | null {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  estaAutenticado(): boolean {
    return !!this.obtenerToken();
  }

  get usuario(): UsuarioSesion | null {
    const guardado = localStorage.getItem(CLAVE_USUARIO);
    if (!guardado) {
      return null;
    }

    try {
      return JSON.parse(guardado) as UsuarioSesion;
    } catch {
      return null;
    }
  }

  cerrarSesion(): void {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    this.router.navigate(['/login']);
  }
}
