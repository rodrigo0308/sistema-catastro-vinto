import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  loginForm: FormGroup;

  constructor(private fb: FormBuilder) {
    // Inicializamos el formulario con validaciones obligatorias
    this.loginForm = this.fb.group({
      nombreUsuario: ['', Validators.required],
      contrasena: ['', Validators.required]
    });
  }

  iniciarSesion() {
    if (this.loginForm.valid) {
      const credenciales = this.loginForm.value;
      console.log('Intentando iniciar sesión con:', credenciales);
      // En el siguiente paso conectaremos esto con tu backend usando HttpClient
      alert('Credenciales capturadas. ¡Listo para enviar al backend!');
    } else {
      alert('Por favor, complete todos los campos.');
    }
  }
}