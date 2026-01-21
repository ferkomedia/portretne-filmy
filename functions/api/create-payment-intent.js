// Create PaymentIntent for Stripe Payment Element
// WITH SPAM PROTECTION: Cloudflare Turnstile verification
// Endpoint: POST /api/create-payment-intent

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const {
            amount,
            productName,
            customerEmail,
            customerName,
            customerPhone,
            // Company/billing info
            companyName,
            companyIco,
            companyDic,
            companyIcDph,
            companyAddress,
            note,
            // Turnstile token
            turnstileToken,
        } = await request.json();

        // ============================================
        // TURNSTILE VERIFICATION
        // ============================================
        const turnstileSecret = env.TURNSTILE_SECRET_KEY;

        if (turnstileSecret) {
            if (!turnstileToken) {
                return new Response(
                    JSON.stringify({ error: 'Chýba overenie. Prosím, obnovte stránku.' }),
                    { status: 400, headers }
                );
            }

            const turnstileValid = await verifyTurnstile(turnstileToken, turnstileSecret, request);
            
            if (!turnstileValid) {
                return new Response(
                    JSON.stringify({ error: 'Overenie zlyhalo. Skúste to znova.' }),
                    { status: 400, headers }
                );
            }
        }

        // ============================================
        // BASIC SPAM CHECK
        // ============================================
        const spamCheck = checkForSpam({ customerName, customerEmail, note });
        if (spamCheck.isSpam) {
            console.log('Spam detected in payment intent:', spamCheck.reason);
            return new Response(
                JSON.stringify({ error: 'Neplatné údaje. Skontrolujte formulár.' }),
                { status: 400, headers }
            );
        }

        // ============================================
        // ORIGINAL PAYMENT LOGIC
        // ============================================

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

        // Build metadata with all customer and company info
        const metadata = {
            product: productName,
            customer_email: customerEmail || '',
            customer_name: customerName || '',
            customer_phone: customerPhone || '',
            company_name: companyName || '',
            company_ico: companyIco || '',
            company_dic: companyDic || '',
            company_icdph: companyIcDph || '',
            company_address: companyAddress || '',
            note: note || '',
        };

        // Create PaymentIntent with metadata
        const params = new URLSearchParams({
            amount: String(amount),
            currency: 'eur',
            'payment_method_types[0]': 'card',
            description: productName,
            receipt_email: customerEmail || '',
        });

        // Add metadata
        Object.entries(metadata).forEach(([key, value]) => {
            params.append(`metadata[${key}]`, value);
        });

        const response = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
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

// ============================================
// SPAM PROTECTION FUNCTIONS
// ============================================

async function verifyTurnstile(token, secret, request) {
    try {
        // Získaj IP adresu používateľa
        const ip = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   '';

        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                secret: secret,
                response: token,
                remoteip: ip,
            }),
        });

        const result = await response.json();
        
        if (!result.success) {
            console.log('Turnstile verification failed:', result['error-codes']);
        }

        return result.success;
    } catch (error) {
        console.error('Turnstile verification error:', error);
        return false;
    }
}

function checkForSpam(data) {
    const allText = Object.values(data).filter(v => v).join(' ').toLowerCase();
    
    // Typické spam vzory
    const spamPatterns = [
        /\b(viagra|cialis|casino|lottery|winner|prize|click here|buy now)\b/i,
        /\b(earn money|make money|work from home|bitcoin|crypto)\b/i,
        /(http[s]?:\/\/.*){3,}/i, // Viac ako 2 URL odkazy
        /\[url=/i, // BBCode linky
        /<a\s+href/i, // HTML linky
        /(.)\1{10,}/i, // Opakujúce sa znaky
    ];

    for (const pattern of spamPatterns) {
        if (pattern.test(allText)) {
            return { isSpam: true, reason: `Pattern match: ${pattern}` };
        }
    }

    // Kontrola či email vyzerá podozrivo
    const email = data.customerEmail || '';
    if (email && /^[a-z]{1,3}[0-9]{5,}@/.test(email)) {
        return { isSpam: true, reason: 'Suspicious email pattern' };
    }

    return { isSpam: false };
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
