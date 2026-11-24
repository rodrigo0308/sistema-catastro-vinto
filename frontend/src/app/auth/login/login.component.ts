import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  loginForm: FormGroup;
  cargando = false;
  error = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    // Inicializamos el formulario con validaciones obligatorias
    this.loginForm = this.fb.group({
      nombreUsuario: ['', Validators.required],
      contrasena: ['', Validators.required]
    });
  }

  iniciarSesion(): void {
    if (this.loginForm.invalid) {
      this.error = 'Por favor, complete todos los campos.';
      return;
    }

    this.error = '';
    this.cargando = true;

    const { nombreUsuario, contrasena } = this.loginForm.value;

    this.authService.login(nombreUsuario, contrasena).subscribe({
      next: () => {
        this.cargando = false;
        this.router.navigate(['/dashboard/catastro']);
      },
      error: (err) => {
        this.cargando = false;
        this.error =
          err?.status === 401
            ? 'Acceso Denegado'
            : 'No se pudo conectar con el servidor. Verifique que el backend esté encendido.';
        alert(this.error);
      }
    });
  }
}
