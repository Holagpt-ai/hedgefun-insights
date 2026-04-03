export interface CreateCheckoutParams {
  customerId?: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
  customerId: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  customerId: string;
  status: 'active' | 'cancelled' | 'paused' | 'past_due';
  currentPeriodEnd: Date;
  priceId: string;
}

export interface CustomerResult {
  customerId: string;
  email: string;
}

export interface WebhookEvent {
  type: 'subscription.created' | 'subscription.cancelled' | 'payment.completed' | 'payment.failed';
  subscriptionId?: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface PaymentProvider {
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;
  createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<SubscriptionResult>;
  createCustomer(params: CreateCustomerParams): Promise<CustomerResult>;
  handleWebhook(payload: string, signature: string): Promise<WebhookEvent>;
}
