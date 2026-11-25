import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: HttpClient, useValue: { get: () => null, post: () => null } },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('debería exigir usuario y contraseña', () => {
    expect(component.loginForm.valid).toBeFalse();

    component.loginForm.setValue({
      nombreUsuario: 'admin',
      contrasena: 'admin123',
    });

    expect(component.loginForm.valid).toBeTrue();
  });
});
