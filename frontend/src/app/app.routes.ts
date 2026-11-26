import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { authGuard } from './auth/auth.guard';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { CatastroComponent } from './modules/catastro/catastro.component';
import { RecaudacionComponent } from './modules/recaudacion/recaudacion.component';
import { RegistroDifuntosComponent } from './modules/registro/registro-difuntos.component';
import { CamposantosComponent } from './modules/camposantos/camposantos.component';
import { NotificacionesComponent } from './modules/notificaciones/notificaciones.component';
import { PortalPublicoComponent } from './publico/portal-publico.component';

export const routes: Routes = [
  // Portal ciudadano abierto: pantalla inicial de la aplicación.
  { path: '', component: PortalPublicoComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'catastro', component: CatastroComponent },
      { path: 'registro', component: RegistroDifuntosComponent },
      { path: 'recaudacion', component: RecaudacionComponent },
      { path: 'camposantos', component: CamposantosComponent },
      { path: 'notificaciones', component: NotificacionesComponent },
    ],
  },
];
