import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  auth = inject(AuthService);

  closed = output();

  credential = '';
  password   = '';
  mode: 'user' | 'admin' = 'user';
  error  = signal('');
  loading = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      if (this.mode === 'admin') {
        await this.auth.login(this.credential, this.password);
      } else {
        await this.auth.login(this.credential);
      }
      this.closed.emit();
    } catch {
      this.error.set('Ungültige Zugangsdaten.');
    } finally {
      this.loading.set(false);
    }
  }
}
