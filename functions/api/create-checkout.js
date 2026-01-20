// Stripe Checkout Session Creator
// Cloudflare Pages Function

export async function onRequestPost(context) {
    const { request, env } = context;

    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const { priceId, productId } = await request.json();

        if (!priceId) {
            return new Response(
                JSON.stringify({ error: 'Chýba priceId' }),
                { status: 400, headers }
            );
        }

        // Get Stripe secret key from environment
        const stripeSecretKey = env.STRIPE_SECRET_KEY;

        if (!stripeSecretKey) {
            console.error('STRIPE_SECRET_KEY not configured');
            return new Response(
                JSON.stringify({ error: 'Platobná brána nie je nakonfigurovaná' }),
                { status: 500, headers }
            );
        }

        // Determine success/cancel URLs
        const origin = new URL(request.url).origin;
        const successUrl = `${origin}/dakujem-platba?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}/cennik`;

        // Create Stripe Checkout Session
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'mode': 'payment',
                'success_url': successUrl,
                'cancel_url': cancelUrl,
                'line_items[0][price]': priceId,
                'line_items[0][quantity]': '1',
                'billing_address_collection': 'required',
                'phone_number_collection[enabled]': 'true',
                'locale': 'sk',
                'metadata[product_id]': productId || '',
            }).toString(),
        });

        const session = await stripeResponse.json();

        if (session.error) {
            console.error('Stripe error:', session.error);
            return new Response(
                JSON.stringify({ error: session.error.message }),
                { status: 400, headers }
            );
        }

        return new Response(
            JSON.stringify({ url: session.url, sessionId: session.id }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Checkout error:', error);
        return new Response(
            JSON.stringify({ error: 'Nastala neočakávaná chyba' }),
            { status: 500, headers }
        );
    }
}

// Handle CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
