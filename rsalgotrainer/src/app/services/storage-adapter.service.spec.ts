import { TestBed } from '@angular/core/testing';

import { StorageAdapterService } from './storage-adapter.service';

describe('StorageAdapterService', () => {
  let service: StorageAdapterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StorageAdapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
