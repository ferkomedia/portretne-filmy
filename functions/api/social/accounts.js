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

        // ============================================
        // CHECK FACEBOOK
        // ============================================
        let fbPageId = env.FB_PAGE_ID;
        let fbPageToken = env.FB_PAGE_TOKEN;
        let fbPageName = env.FB_PAGE_NAME;

        if (env.SOCIAL_TOKENS) {
            if (!fbPageId) fbPageId = await env.SOCIAL_TOKENS.get('fb_page_id');
            if (!fbPageToken) fbPageToken = await env.SOCIAL_TOKENS.get('fb_page_token');
            if (!fbPageName) fbPageName = await env.SOCIAL_TOKENS.get('fb_page_name');
        }

        if (fbPageId && fbPageToken) {
            accounts.facebook = {
                connected: true,
                pageId: fbPageId,
                pageName: fbPageName || 'Facebook Page'
            };

            // Optionally fetch followers count
            try {
                const response = await fetch(
                    `https://graph.facebook.com/v24.0/${fbPageId}?fields=followers_count,fan_count&access_token=${fbPageToken}`
                );
                const data = await response.json();
                if (data.followers_count || data.fan_count) {
                    accounts.facebook.followers = data.followers_count || data.fan_count;
                }
            } catch (e) {
                console.error('Error fetching FB followers:', e);
            }
        }

        // ============================================
        // CHECK INSTAGRAM
        // ============================================
        let igUserId = env.IG_USER_ID;
        let igUsername = env.IG_USERNAME;

        if (env.SOCIAL_TOKENS) {
            if (!igUserId) igUserId = await env.SOCIAL_TOKENS.get('ig_user_id');
            if (!igUsername) igUsername = await env.SOCIAL_TOKENS.get('ig_username');
        }

        if (igUserId) {
            accounts.instagram = {
                connected: true,
                userId: igUserId,
                username: igUsername || 'Instagram Account'
            };

            // Try to get followers if we have token
            if (fbPageToken) {
                try {
                    const response = await fetch(
                        `https://graph.facebook.com/v24.0/${igUserId}?fields=followers_count,username&access_token=${fbPageToken}`
                    );
                    const data = await response.json();
                    if (data.followers_count) {
                        accounts.instagram.followers = data.followers_count;
                    }
                    if (data.username) {
                        accounts.instagram.username = data.username;
                    }
                } catch (e) {
                    console.error('Error fetching IG followers:', e);
                }
            }
        }

        // ============================================
        // CHECK LINKEDIN
        // ============================================
        let liAccessToken = env.LI_ACCESS_TOKEN;
        let liPersonUrn = env.LI_PERSON_URN;
        let liProfileName = env.LI_PROFILE_NAME;

        if (env.SOCIAL_TOKENS) {
            if (!liAccessToken) liAccessToken = await env.SOCIAL_TOKENS.get('li_access_token');
            if (!liPersonUrn) liPersonUrn = await env.SOCIAL_TOKENS.get('li_person_urn');
            if (!liProfileName) liProfileName = await env.SOCIAL_TOKENS.get('li_profile_name');
        }

        if (liAccessToken && liPersonUrn) {
            accounts.linkedin = {
                connected: true,
                personUrn: liPersonUrn,
                profileName: liProfileName || 'LinkedIn Profile'
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
