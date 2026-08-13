import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from '../nav/nav.component';

@Component({
  selector: 'app-initcont',
  imports: [NavComponent, RouterOutlet],
  templateUrl: './initcont.component.html',
  styleUrl: './initcont.component.scss'
})
export class InitcontComponent {}
