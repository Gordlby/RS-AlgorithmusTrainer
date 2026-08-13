import { Routes } from '@angular/router';
import { InitcontComponent } from './initcont/initcont.component';
import { ErrorpageComponent } from './errorpage/errorpage.component';
import { AlgoeditorComponent } from './algoeditor/algoeditor.component';
import { AlgokartenComponent } from './algokarten/algokarten.component';
import { AlgoquizComponent } from './algoquiz/algoquiz.component';
import { FlowchartComponent } from './flowchart/flowchart.component';
import { AdminRequestsComponent } from './admin-requests/admin-requests.component';
import { KuerzelComponent } from './kuerzel/kuerzel.component';

export const routes: Routes = [
  {
    path: '',
    component: InitcontComponent,
    children: [
      { path: '', redirectTo: 'editor', pathMatch: 'full' },
      { path: 'editor',    component: AlgoeditorComponent },
      { path: 'karten',    component: AlgokartenComponent },
      { path: 'quiz',      component: AlgoquizComponent },
      { path: 'flowchart', component: FlowchartComponent },
      { path: 'anfragen',  component: AdminRequestsComponent },
      { path: 'kuerzel',   component: KuerzelComponent },
    ]
  },
  { path: '**', component: ErrorpageComponent }
];
