// Social Media Publishing API
// Endpoint: POST /api/social/publish
// Supports: Facebook Pages, Instagram, LinkedIn

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
                        results.instagram = await publishToInstagram(env, content, mediaUrls);
                        break;
                    case 'linkedin':
                        results.linkedin = await publishToLinkedIn(env, content, mediaUrls);
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
    // First try to get tokens from env, then KV
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

// ============================================
// INSTAGRAM PUBLISHING
// ============================================
async function publishToInstagram(env, content, mediaUrls) {
    // Instagram requires media - text-only posts are not supported
    if (!mediaUrls || mediaUrls.length === 0) {
        throw new Error('Instagram vyžaduje obrázok alebo video. Text-only príspevky nie sú podporované.');
    }

    // Get Instagram credentials from env or KV
    let igUserId = env.IG_USER_ID;
    let accessToken = env.FB_PAGE_TOKEN; // Instagram uses Facebook Page token

    if (env.SOCIAL_TOKENS) {
        if (!igUserId) {
            igUserId = await env.SOCIAL_TOKENS.get('ig_user_id');
        }
        if (!accessToken) {
            accessToken = await env.SOCIAL_TOKENS.get('fb_page_token');
        }
    }

    if (!igUserId || !accessToken) {
        throw new Error('Instagram nie je nakonfigurovaný. Prepojte Instagram Business účet s Facebook Page.');
    }

    // Step 1: Create media container
    const createResponse = await fetch(
        `https://graph.facebook.com/v24.0/${igUserId}/media`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                image_url: mediaUrls[0],
                caption: content,
                access_token: accessToken
            })
        }
    );

    const createData = await createResponse.json();

    if (createData.error) {
        throw new Error(createData.error.message);
    }

    const containerId = createData.id;

    // Step 2: Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Publish the container
    const publishResponse = await fetch(
        `https://graph.facebook.com/v24.0/${igUserId}/media_publish`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                creation_id: containerId,
                access_token: accessToken
            })
        }
    );

    const publishData = await publishResponse.json();

    if (publishData.error) {
        throw new Error(publishData.error.message);
    }

    return { postId: publishData.id, success: true };
}

// ============================================
// LINKEDIN PUBLISHING
// ============================================
async function publishToLinkedIn(env, content, mediaUrls) {
    // Get LinkedIn credentials from env or KV
    let personUrn = env.LI_PERSON_URN;
    let accessToken = env.LI_ACCESS_TOKEN;

    if (env.SOCIAL_TOKENS) {
        if (!personUrn) {
            personUrn = await env.SOCIAL_TOKENS.get('li_person_urn');
        }
        if (!accessToken) {
            accessToken = await env.SOCIAL_TOKENS.get('li_access_token');
        }
    }

    if (!personUrn || !accessToken) {
        throw new Error('LinkedIn nie je nakonfigurovaný. Prosím prepojte LinkedIn účet v nastaveniach.');
    }

    // Check if we have media
    const hasMedia = mediaUrls && mediaUrls.length > 0;

    // Build the post body according to LinkedIn API v2
    const postBody = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: content
                },
                shareMediaCategory: hasMedia ? 'ARTICLE' : 'NONE'
            }
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
    };

    // If we have media, add it as an article with thumbnail
    if (hasMedia) {
        postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [{
            status: 'READY',
            originalUrl: mediaUrls[0],
            title: {
                text: content.substring(0, 100)
            }
        }];
    }

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202401'
        },
        body: JSON.stringify(postBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'LinkedIn API error';
        try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorText;
        } catch {
            errorMessage = errorText;
        }
        throw new Error(errorMessage);
    }

    const postId = response.headers.get('X-RestLi-Id') || 'posted';
    return { postId, success: true };
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
