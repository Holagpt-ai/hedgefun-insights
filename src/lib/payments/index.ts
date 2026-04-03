import { PaddleProvider } from './paddle';
import { StripeProvider } from './stripe';
import { AuthorizeProvider } from './authorize';
import { BlockProvider } from './block';
import type { PaymentProvider } from './types';

const provider = import.meta.env.VITE_PAYMENT_PROVIDER || 'placeholder';

const providers: Record<string, PaymentProvider> = {
  paddle: new PaddleProvider(),
  stripe: new StripeProvider(),
  authorize: new AuthorizeProvider(),
  block: new BlockProvider(),
};

if (provider !== 'placeholder' && !providers[provider]) {
  throw new Error(`Payment provider "${provider}" not configured.`);
}

export const payments = provider !== 'placeholder' ? providers[provider] : null;
export type { PaymentProvider } from './types';
