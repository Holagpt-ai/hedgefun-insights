import type { PaymentProvider } from './types';
export type { PaymentProvider } from './types';

// Payment processor not yet configured.
// To integrate a new processor: implement the PaymentProvider interface
// in a new file (e.g. payments/paddle.ts), import it here, and set
// VITE_PAYMENT_PROVIDER in your environment variables.
export const payments: PaymentProvider | null = null;
