import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './layout/dashboard/dashboard.component';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { 
    path: 'dashboard', 
    component: DashboardComponent,
    children: [
      // En los siguientes pasos conectaremos los componentes aquí
      // { path: 'catastro', component: CatastroComponent },
      // { path: 'recaudacion', component: RecaudacionComponent }
    ]
    }
];