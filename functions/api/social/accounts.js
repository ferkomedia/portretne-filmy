// Social Media Accounts API
// Endpoint: GET /api/social/accounts

export async function onRequestGet(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        // Auth check
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== env.ADMIN_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'Neautorizovaný prístup' }),
                { status: 401, headers }
            );
        }

        const accounts = {
            facebook: { connected: false },
            instagram: { connected: false },
            linkedin: { connected: false }
        };

        // Check Facebook
        if (env.SOCIAL_TOKENS) {
            const fbPageId = await env.SOCIAL_TOKENS.get('fb_page_id');
            const fbPageName = await env.SOCIAL_TOKENS.get('fb_page_name');
            const fbPageToken = await env.SOCIAL_TOKENS.get('fb_page_token');

            if (fbPageId && fbPageToken) {
                accounts.facebook = {
                    connected: true,
                    pageId: fbPageId,
                    pageName: fbPageName || 'Facebook Page'
                };

                // Optionally fetch followers count
                try {
                    const response = await fetch(
                        `https://graph.facebook.com/v24.0/${fbPageId}?fields=followers_count&access_token=${fbPageToken}`
                    );
                    const data = await response.json();
                    if (data.followers_count) {
                        accounts.facebook.followers = data.followers_count;
                    }
                } catch (e) {
                    console.error('Error fetching FB followers:', e);
                }
            }

            // Check Instagram
            const igUserId = await env.SOCIAL_TOKENS.get('ig_user_id');
            const igUsername = await env.SOCIAL_TOKENS.get('ig_username');

            if (igUserId && igUsername) {
                accounts.instagram = {
                    connected: true,
                    userId: igUserId,
                    username: igUsername
                };
            }

            // Check LinkedIn
            const liAccessToken = await env.SOCIAL_TOKENS.get('li_access_token');
            const liProfileName = await env.SOCIAL_TOKENS.get('li_profile_name');

            if (liAccessToken) {
                accounts.linkedin = {
                    connected: true,
                    profileName: liProfileName || 'LinkedIn Profile'
                };
            }
        }

        // Fallback to env vars
        if (env.FB_PAGE_ID && env.FB_PAGE_TOKEN) {
            accounts.facebook = {
                connected: true,
                pageId: env.FB_PAGE_ID,
                pageName: env.FB_PAGE_NAME || 'Facebook Page'
            };
        }

        return new Response(
            JSON.stringify({
                ok: true,
                accounts
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Social accounts error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers }
        );
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        },
    });
}
