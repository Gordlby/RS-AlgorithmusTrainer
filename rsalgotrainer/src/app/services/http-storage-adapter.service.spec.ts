import { TestBed } from '@angular/core/testing';

import { HttpStorageAdapterService } from './http-storage-adapter.service';

describe('HttpStorageAdapterService', () => {
  let service: HttpStorageAdapterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HttpStorageAdapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
