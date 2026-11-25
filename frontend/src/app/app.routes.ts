import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { authGuard } from './auth/auth.guard';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { CatastroComponent } from './modules/catastro/catastro.component';
import { RecaudacionComponent } from './modules/recaudacion/recaudacion.component';
import { RegistroDifuntosComponent } from './modules/registro/registro-difuntos.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'catastro', component: CatastroComponent },
      { path: 'registro', component: RegistroDifuntosComponent },
      { path: 'recaudacion', component: RecaudacionComponent },
    ],
  },
];
