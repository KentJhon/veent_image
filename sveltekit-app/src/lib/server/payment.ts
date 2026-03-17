/**
 * Abstract payment service interface.
 * Implement this with Stripe, PayPal, or any other provider.
 */
export interface PaymentIntent {
	id: string;
	clientSecret: string;
	amountCents: number;
	currency: string;
	status: 'pending' | 'completed' | 'failed';
}

export interface PaymentService {
	createPaymentIntent(amountCents: number, currency: string, metadata: Record<string, string>): Promise<PaymentIntent>;
	verifyWebhook(body: string, signature: string): Promise<{ eventType: string; paymentIntentId: string }>;
}

/**
 * Stub implementation for development.
 * Replace with a real provider (Stripe, PayPal, etc.) before production.
 */
export class StubPaymentService implements PaymentService {
	async createPaymentIntent(
		amountCents: number,
		currency: string,
		metadata: Record<string, string>
	): Promise<PaymentIntent> {
		const id = `stub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		return {
			id,
			clientSecret: `secret_${id}`,
			amountCents,
			currency,
			status: 'pending'
		};
	}

	async verifyWebhook(
		_body: string,
		_signature: string
	): Promise<{ eventType: string; paymentIntentId: string }> {
		return {
			eventType: 'payment_intent.succeeded',
			paymentIntentId: 'stub_test'
		};
	}
}

// Export a singleton — swap the implementation when integrating a real provider
export const paymentService: PaymentService = new StubPaymentService();
