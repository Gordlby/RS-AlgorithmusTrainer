import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InitcontComponent } from './initcont.component';

describe('InitcontComponent', () => {
  let component: InitcontComponent;
  let fixture: ComponentFixture<InitcontComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InitcontComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InitcontComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
