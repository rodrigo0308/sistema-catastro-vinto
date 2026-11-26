import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService, UsuarioSesion } from '../../auth/auth.service';

const API_URL = 'http://localhost:3000';

export interface AlertaNotificacion {
  id: string;
  nivel: 'critico' | 'advertencia' | 'info';
  motivo: string;
  difunto: string;
  ubicacion: string;
  estado: string;
  solicitante: string | null;
}

export interface RespuestaAlertas {
  totalCriticos: number;
  totalAdvertencias: number;
  totalPerpetuos: number;
  totalAlertas: number;
  alertas: AlertaNotificacion[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  isCollapsed = false;
  usuario: UsuarioSesion | null;

  // Campana de notificaciones de vencimiento
  totalNotificaciones = 0;
  ultimasAlertas: AlertaNotificacion[] = [];
  panelNotificacionesAbierto = false;
  cargandoAlertas = false;

  constructor(
    private readonly authService: AuthService,
    private readonly http: HttpClient
  ) {
    this.usuario = this.authService.usuario;
  }

  ngOnInit(): void {
    this.cargarAlertas();
  }

  /** Total de alertas críticas + advertencias y las 5 más urgentes. */
  cargarAlertas(): void {
    this.cargandoAlertas = true;

    this.http.get<RespuestaAlertas>(`${API_URL}/catastro/alertas`).subscribe({
      next: (respuesta) => {
        const criticos = Number(respuesta?.totalCriticos) || 0;
        const advertencias = Number(respuesta?.totalAdvertencias) || 0;

        this.totalNotificaciones = criticos + advertencias;
        this.ultimasAlertas = (respuesta?.alertas ?? [])
          .filter((alerta) => alerta.nivel !== 'info')
          .slice(0, 5);
        this.cargandoAlertas = false;
      },
      error: (err) => {
        console.error('Error al cargar las alertas:', err);
        this.cargandoAlertas = false;
      },
    });
  }

  alternarNotificaciones(evento?: Event): void {
    evento?.stopPropagation();
    this.panelNotificacionesAbierto = !this.panelNotificacionesAbierto;
  }

  /** Cierra el panel rápido al hacer clic fuera de la campana. */
  @HostListener('document:click', ['$event'])
  cerrarPanelNotificaciones(evento: Event): void {
    if (!this.panelNotificacionesAbierto) {
      return;
    }

    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest('.notif-wrapper')) {
      return;
    }

    this.panelNotificacionesAbierto = false;
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
  }
}
