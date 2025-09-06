import { vi } from 'vitest';

export const mockClient = {
  commands: {
    run: vi.fn().mockResolvedValue({ output: '' }),
  },
};

export const mockSandbox = {
  id: 'test-sandbox-id',
  connect: vi.fn().mockResolvedValue(mockClient),
  fork: vi.fn(),
};

export const mockSDK = {
  sandboxes: {
    create: vi.fn().mockResolvedValue(mockSandbox),
    resume: vi.fn().mockResolvedValue(mockSandbox),
    get: vi.fn().mockResolvedValue({ id: 'test-sandbox-id', title: 'Test Sandbox' }),
    hibernate: vi.fn().mockResolvedValue(undefined),
    listRunning: vi.fn().mockResolvedValue({
      concurrentVmCount: 2,
      concurrentVmLimit: 10,
      vms: [
        {
          id: 'sandbox-1',
          lastActiveAt: new Date().toISOString(),
          sessionStartedAt: new Date().toISOString(),
          specs: { cpu: 2, memory: 2048, storage: 8 },
        },
      ],
    }),
  },
};

export class CodeSandbox {
  sandboxes = mockSDK.sandboxes;
  
  constructor(apiKey: string) {
    // Mock constructor
  }
}

export const VMTier = {
  Pico: 1,
  Nano: 2,
  Micro: 3,
};