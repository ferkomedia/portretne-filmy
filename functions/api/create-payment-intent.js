// Create PaymentIntent for Stripe Payment Element
// Endpoint: POST /api/create-payment-intent

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const { amount, productName, customerEmail, customerName } = await request.json();

        if (!amount || !productName) {
            return new Response(
                JSON.stringify({ error: 'Chýbajú povinné polia: amount, productName' }),
                { status: 400, headers }
            );
        }

        const stripeSecretKey = env.STRIPE_SECRET_KEY;

        if (!stripeSecretKey) {
            return new Response(
                JSON.stringify({ error: 'Stripe nie je nakonfigurovaný' }),
                { status: 500, headers }
            );
        }

        // Create PaymentIntent - only cards
        const response = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                amount: String(amount), // in cents
                currency: 'eur',
                'payment_method_types[0]': 'card',
                description: productName,
                'metadata[product]': productName,
                'metadata[customer_email]': customerEmail || '',
                'metadata[customer_name]': customerName || '',
            }),
        });

        const paymentIntent = await response.json();

        if (paymentIntent.error) {
            return new Response(
                JSON.stringify({ error: paymentIntent.error.message }),
                { status: 400, headers }
            );
        }

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('PaymentIntent error:', error);
        return new Response(
            JSON.stringify({ error: 'Nastala neočakávaná chyba' }),
            { status: 500, headers }
        );
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
