import type { PaymentProvider, CreateCheckoutParams, CheckoutResult, CreateSubscriptionParams, SubscriptionResult, CreateCustomerParams, CustomerResult, WebhookEvent } from './types';

export class BlockProvider implements PaymentProvider {
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    throw new Error('Block: createCheckout not yet implemented');
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error('Block: createSubscription not yet implemented');
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    throw new Error('Block: cancelSubscription not yet implemented');
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    throw new Error('Block: getSubscription not yet implemented');
  }

  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    throw new Error('Block: createCustomer not yet implemented');
  }

  async handleWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    throw new Error('Block: handleWebhook not yet implemented');
  }
}
