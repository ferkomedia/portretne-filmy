// Social Media Stats API
// Endpoint: GET /api/social/stats

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

        let scheduled = 0;
        let published = 0;
        let thisWeek = 0;
        let accounts = 0;

        // Count connected accounts
        if (env.SOCIAL_TOKENS) {
            const fbToken = await env.SOCIAL_TOKENS.get('fb_page_token');
            if (fbToken) accounts++;
            
            const liToken = await env.SOCIAL_TOKENS.get('li_access_token');
            if (liToken) accounts++;
        }

        // Fallback to env vars
        if (env.FB_PAGE_TOKEN) accounts = Math.max(accounts, 1);

        // Get stats from KV
        if (env.SOCIAL_POSTS) {
            const list = await env.SOCIAL_POSTS.list();
            
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            for (const key of list.keys) {
                if (key.name.startsWith('post_')) {
                    const post = await env.SOCIAL_POSTS.get(key.name);
                    if (post) {
                        const data = JSON.parse(post);
                        if (data.status === 'scheduled') {
                            scheduled++;
                        }
                    }
                } else if (key.name.startsWith('published_')) {
                    published++;
                    
                    const post = await env.SOCIAL_POSTS.get(key.name);
                    if (post) {
                        const data = JSON.parse(post);
                        if (new Date(data.publishedAt) > weekAgo) {
                            thisWeek++;
                        }
                    }
                }
            }
        }

        return new Response(
            JSON.stringify({
                ok: true,
                scheduled,
                published,
                accounts,
                thisWeek
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Social stats error:', error);
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
