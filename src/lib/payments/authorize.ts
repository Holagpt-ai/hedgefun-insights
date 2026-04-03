import type { PaymentProvider, CreateCheckoutParams, CheckoutResult, CreateSubscriptionParams, SubscriptionResult, CreateCustomerParams, CustomerResult, WebhookEvent } from './types';

export class AuthorizeProvider implements PaymentProvider {
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    throw new Error('Authorize.net: createCheckout not yet implemented');
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error('Authorize.net: createSubscription not yet implemented');
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    throw new Error('Authorize.net: cancelSubscription not yet implemented');
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    throw new Error('Authorize.net: getSubscription not yet implemented');
  }

  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    throw new Error('Authorize.net: createCustomer not yet implemented');
  }

  async handleWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    throw new Error('Authorize.net: handleWebhook not yet implemented');
  }
}
