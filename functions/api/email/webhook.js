// Email Webhook Handler
// Endpoint: POST /api/email/webhook
// Handles webhooks from Resend for delivery, open, click, bounce tracking

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const payload = await request.json();

        // Resend webhook format
        const eventType = payload.type;
        const data = payload.data;

        if (!eventType || !data) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid webhook payload' }),
                { status: 400, headers }
            );
        }

        // Map Resend event types to our format
        const eventMapping = {
            'email.sent': 'sent',
            'email.delivered': 'delivered',
            'email.opened': 'opened',
            'email.clicked': 'clicked',
            'email.bounced': 'bounced',
            'email.complained': 'complaint',
            'email.delivery_delayed': 'delayed'
        };

        const normalizedType = eventMapping[eventType] || eventType;

        // Create event record
        const event = {
            type: normalizedType,
            email: data.to?.[0] || data.email || '',
            timestamp: new Date().toISOString(),
            messageId: data.email_id || data.id || '',
            campaignId: data.tags?.campaign_id || '',
            link: data.click?.link || null,
            bounceType: data.bounce?.type || null,
            raw: payload
        };

        // Store event in KV
        if (env.EMAIL_MARKETING) {
            const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await env.EMAIL_MARKETING.put(eventId, JSON.stringify(event));

            // Update campaign stats if we have campaign ID
            if (event.campaignId) {
                const campaignKey = `campaign_${event.campaignId}`;
                const campaignData = await env.EMAIL_MARKETING.get(campaignKey, { type: 'json' });
                
                if (campaignData) {
                    switch (normalizedType) {
                        case 'delivered':
                            campaignData.delivered = (campaignData.delivered || 0) + 1;
                            break;
                        case 'opened':
                            campaignData.opened = (campaignData.opened || 0) + 1;
                            break;
                        case 'clicked':
                            campaignData.clicked = (campaignData.clicked || 0) + 1;
                            break;
                        case 'bounced':
                            campaignData.bounced = (campaignData.bounced || 0) + 1;
                            // Also update contact status
                            await updateContactBounceStatus(env, event.email);
                            break;
                        case 'complaint':
                            campaignData.complaints = (campaignData.complaints || 0) + 1;
                            // Unsubscribe on complaint
                            await unsubscribeContact(env, event.email);
                            break;
                    }
                    
                    await env.EMAIL_MARKETING.put(campaignKey, JSON.stringify(campaignData));
                }
            }

            // Handle bounces - update contact status
            if (normalizedType === 'bounced') {
                await updateContactBounceStatus(env, event.email);
            }

            // Handle complaints - unsubscribe
            if (normalizedType === 'complaint') {
                await unsubscribeContact(env, event.email);
            }
        }

        return new Response(
            JSON.stringify({ ok: true, received: eventType }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers }
        );
    }
}

async function updateContactBounceStatus(env, email) {
    if (!env.EMAIL_MARKETING || !email) return;
    
    try {
        // Find contact by email
        const contactsList = await env.EMAIL_MARKETING.list({ prefix: 'contact_' });
        
        for (const key of contactsList.keys) {
            const contact = await env.EMAIL_MARKETING.get(key.name, { type: 'json' });
            if (contact && contact.email === email) {
                contact.status = 'bounced';
                contact.bouncedAt = new Date().toISOString();
                await env.EMAIL_MARKETING.put(key.name, JSON.stringify(contact));
                break;
            }
        }
    } catch (e) {
        console.error('Error updating bounce status:', e);
    }
}

async function unsubscribeContact(env, email) {
    if (!env.EMAIL_MARKETING || !email) return;
    
    try {
        const contactsList = await env.EMAIL_MARKETING.list({ prefix: 'contact_' });
        
        for (const key of contactsList.keys) {
            const contact = await env.EMAIL_MARKETING.get(key.name, { type: 'json' });
            if (contact && contact.email === email) {
                contact.status = 'unsubscribed';
                contact.unsubscribedAt = new Date().toISOString();
                contact.unsubscribeReason = 'complaint';
                await env.EMAIL_MARKETING.put(key.name, JSON.stringify(contact));
                break;
            }
        }
    } catch (e) {
        console.error('Error unsubscribing contact:', e);
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
