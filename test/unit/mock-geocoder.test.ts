import { describe, expect, it } from 'vitest';
import { MockGeocoderAdapter } from '../../src/infrastructure/geocoding/mock-geocoder.js';
import type { Address } from '../../src/domain/orders/order.types.js';

const address = (city: string): Address => ({
  line1: 'Calle 1',
  city,
  region: 'Test',
  postalCode: '000000',
  country: 'CO',
});

describe('MockGeocoderAdapter', () => {
  const geocoder = new MockGeocoderAdapter();

  it('geocodes US cities', async () => {
    await expect(geocoder.geocode(address('New York'))).resolves.toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
    await expect(geocoder.geocode(address('Los Angeles'))).resolves.toEqual({
      latitude: 34.0522,
      longitude: -118.2437,
    });
  });

  it('ignores accents, surrounding spaces, and letter casing', async () => {
    await expect(geocoder.geocode(address('  MEDELLÍN  '))).resolves.toEqual({
      latitude: 6.2442,
      longitude: -75.5812,
    });
    await expect(geocoder.geocode(address('  SAN FRANCISCO  '))).resolves.toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
    });
  });

  it('rejects a city the mock provider cannot geocode', async () => {
    await expect(geocoder.geocode(address('Unknown'))).rejects.toMatchObject({ statusCode: 422 });
  });
});
