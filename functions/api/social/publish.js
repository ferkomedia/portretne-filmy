// Social Media Publishing API
// Endpoint: POST /api/social/publish
// Supports: Facebook Pages

export async function onRequestPost(context) {
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

        const { platforms, content, schedule, scheduledTime, mediaUrls } = await request.json();

        if (!platforms || platforms.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Vyber aspoň jednu platformu' }),
                { status: 400, headers }
            );
        }

        if (!content) {
            return new Response(
                JSON.stringify({ error: 'Text príspevku je povinný' }),
                { status: 400, headers }
            );
        }

        const results = {};
        const errors = [];

        // If scheduled, save to KV for later processing
        if (schedule === 'scheduled' && scheduledTime) {
            const postId = `post_${Date.now()}`;
            const scheduledPost = {
                id: postId,
                platforms,
                content,
                mediaUrls: mediaUrls || [],
                scheduledTime,
                status: 'scheduled',
                createdAt: new Date().toISOString()
            };

            if (env.SOCIAL_POSTS) {
                await env.SOCIAL_POSTS.put(postId, JSON.stringify(scheduledPost));
            }

            return new Response(
                JSON.stringify({ 
                    ok: true, 
                    message: 'Príspevok naplánovaný',
                    postId,
                    scheduledTime 
                }),
                { status: 200, headers }
            );
        }

        // If draft, save to KV
        if (schedule === 'draft') {
            const draftId = `draft_${Date.now()}`;
            const draft = {
                id: draftId,
                platforms,
                content,
                mediaUrls: mediaUrls || [],
                status: 'draft',
                createdAt: new Date().toISOString()
            };

            if (env.SOCIAL_POSTS) {
                await env.SOCIAL_POSTS.put(draftId, JSON.stringify(draft));
            }

            return new Response(
                JSON.stringify({ ok: true, message: 'Draft uložený', draftId }),
                { status: 200, headers }
            );
        }

        // Publish immediately
        for (const platform of platforms) {
            try {
                switch (platform) {
                    case 'facebook':
                        results.facebook = await publishToFacebook(env, content, mediaUrls);
                        break;
                    case 'instagram':
                        // Instagram requires business account connected to Page
                        results.instagram = { success: false, error: 'Instagram zatiaľ nie je implementovaný' };
                        break;
                    case 'linkedin':
                        results.linkedin = { success: false, error: 'LinkedIn zatiaľ nie je implementovaný' };
                        break;
                }
            } catch (err) {
                errors.push({ platform, error: err.message });
            }
        }

        // Save to history
        if (env.SOCIAL_POSTS) {
            const historyId = `published_${Date.now()}`;
            await env.SOCIAL_POSTS.put(historyId, JSON.stringify({
                id: historyId,
                platforms,
                content,
                mediaUrls: mediaUrls || [],
                results,
                errors,
                status: 'published',
                publishedAt: new Date().toISOString()
            }));
        }

        return new Response(
            JSON.stringify({ 
                ok: errors.length === 0, 
                results,
                errors: errors.length > 0 ? errors : undefined
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Social publish error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers }
        );
    }
}

// ============================================
// FACEBOOK PUBLISHING
// ============================================
async function publishToFacebook(env, content, mediaUrls) {
    // First try to get tokens from KV
    let pageId = env.FB_PAGE_ID;
    let accessToken = env.FB_PAGE_TOKEN;

    // If not in env, try KV
    if (env.SOCIAL_TOKENS) {
        if (!pageId) {
            pageId = await env.SOCIAL_TOKENS.get('fb_page_id');
        }
        if (!accessToken) {
            accessToken = await env.SOCIAL_TOKENS.get('fb_page_token');
        }
    }

    if (!pageId || !accessToken) {
        throw new Error('Facebook nie je nakonfigurovaný. Prosím prepojte Facebook účet v nastaveniach.');
    }

    let endpoint = `https://graph.facebook.com/v24.0/${pageId}/feed`;
    const params = new URLSearchParams({
        message: content,
        access_token: accessToken
    });

    // If we have media, use photos endpoint instead
    if (mediaUrls && mediaUrls.length > 0) {
        endpoint = `https://graph.facebook.com/v24.0/${pageId}/photos`;
        params.append('url', mediaUrls[0]); // Facebook accepts URL to image
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    return { postId: data.id || data.post_id, success: true };
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        },
    });
}
