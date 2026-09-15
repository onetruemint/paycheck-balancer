import { getEnvVar } from '../../src/utils/envVar';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('get environment variables', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('should get an environment variable', () => {
    const value = 'I am the mocked env';
    vi.stubEnv('MOCK_ENV', value);

    expect(getEnvVar('MOCK_ENV')).toBe(value);
  });

  it('should return the default value', () => {
    const value = 'I am the default value';
    const opts = {
      default: value,
    };

    expect(getEnvVar('MOCK_ENV', opts)).toBe(value);
  });

  it('should throw an error if value is not set', () => {
    expect(() => getEnvVar('MOCK_ENV')).toThrow('Variable MOCK_ENV not set!');
  });
});
