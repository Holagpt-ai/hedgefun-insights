import type { PaymentProvider, CreateCheckoutParams, CheckoutResult, CreateSubscriptionParams, SubscriptionResult, CreateCustomerParams, CustomerResult, WebhookEvent } from './types';

export class StripeProvider implements PaymentProvider {
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    throw new Error('Stripe: createCheckout not yet implemented');
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error('Stripe: createSubscription not yet implemented');
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    throw new Error('Stripe: cancelSubscription not yet implemented');
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    throw new Error('Stripe: getSubscription not yet implemented');
  }

  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    throw new Error('Stripe: createCustomer not yet implemented');
  }

  async handleWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    throw new Error('Stripe: handleWebhook not yet implemented');
  }
}
