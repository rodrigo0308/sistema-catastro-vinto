import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { CatastroComponent } from './modules/catastro/catastro.component';
import { RecaudacionComponent } from './modules/recaudacion/recaudacion.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    children: [
      { path: 'catastro', component: CatastroComponent },
      { path: 'recaudacion', component: RecaudacionComponent } // <-- Nueva ruta
    ]
  }
];