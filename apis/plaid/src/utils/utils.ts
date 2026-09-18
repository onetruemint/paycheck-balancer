import { CountryCode, Products } from 'plaid';

export enum Decorators {
  GET_CLIENT = 'getClient',
  GET_CONFIG = 'getConfig',
}

export interface ConfigDecorator {
  products: Products[];
  countryCodes: CountryCode[];
  androidPackageName: string;
}
