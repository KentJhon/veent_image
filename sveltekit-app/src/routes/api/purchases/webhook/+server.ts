import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { paymentService } from '$lib/server/payment.js';
import { completePurchase } from '$lib/server/services/purchase.service.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const signature = request.headers.get('stripe-signature') ?? '';

	try {
		const event = await paymentService.verifyWebhook(body, signature);

		if (event.eventType === 'payment_intent.succeeded') {
			await completePurchase(event.paymentIntentId);
		}

		return json({ received: true });
	} catch (err) {
		return error(400, err instanceof Error ? err.message : 'Webhook verification failed');
	}
};
