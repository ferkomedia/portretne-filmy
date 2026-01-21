// Meta OAuth Callback (Facebook + Instagram)
// Endpoint: GET /api/social/oauth/meta/callback

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // If error from Meta
    if (error) {
        return new Response(
            `<html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení</h1>
                    <p>${errorDescription || error}</p>
                    <a href="/sprava-fk2026/" style="color: #f97316;">Späť na správu</a>
                </body>
            </html>`,
            {
                status: 400,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }

    if (!code) {
        return new Response('Missing code parameter', { status: 400 });
    }

    try {
        const appId = env.META_APP_ID;
        const appSecret = env.META_APP_SECRET;
        const redirectUri = `${url.origin}/api/social/oauth/meta/callback`;

        // Exchange code for access token
        const tokenResponse = await fetch(
            `https://graph.facebook.com/v18.0/oauth/access_token?` +
            `client_id=${appId}&` +
            `client_secret=${appSecret}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `code=${code}`
        );

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            throw new Error(tokenData.error.message);
        }

        const shortLivedToken = tokenData.access_token;

        // Exchange for long-lived token (60 days)
        const longTokenResponse = await fetch(
            `https://graph.facebook.com/v18.0/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${appId}&` +
            `client_secret=${appSecret}&` +
            `fb_exchange_token=${shortLivedToken}`
        );

        const longTokenData = await longTokenResponse.json();

        if (longTokenData.error) {
            throw new Error(longTokenData.error.message);
        }

        const accessToken = longTokenData.access_token;

        // Get user info
        const userResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${accessToken}`
        );
        const userData = await userResponse.json();

        // Get user's pages
        const pagesResponse = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
        );
        const pagesData = await pagesResponse.json();

        // Get Instagram business accounts connected to pages
        let instagramAccounts = [];
        if (pagesData.data) {
            for (const page of pagesData.data) {
                const igResponse = await fetch(
                    `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
                );
                const igData = await igResponse.json();
                if (igData.instagram_business_account) {
                    // Get IG account details
                    const igDetailsResponse = await fetch(
                        `https://graph.facebook.com/v18.0/${igData.instagram_business_account.id}?fields=username,followers_count&access_token=${page.access_token}`
                    );
                    const igDetails = await igDetailsResponse.json();
                    instagramAccounts.push({
                        id: igData.instagram_business_account.id,
                        username: igDetails.username,
                        followers: igDetails.followers_count,
                        pageId: page.id,
                        pageToken: page.access_token
                    });
                }
            }
        }

        // Store tokens in KV (in production, encrypt these!)
        if (env.SOCIAL_TOKENS) {
            await env.SOCIAL_TOKENS.put('meta_user_token', accessToken);
            await env.SOCIAL_TOKENS.put('meta_user_id', userData.id);
            
            if (pagesData.data && pagesData.data.length > 0) {
                // Store first page's token
                await env.SOCIAL_TOKENS.put('fb_page_id', pagesData.data[0].id);
                await env.SOCIAL_TOKENS.put('fb_page_token', pagesData.data[0].access_token);
                await env.SOCIAL_TOKENS.put('fb_page_name', pagesData.data[0].name);
            }

            if (instagramAccounts.length > 0) {
                await env.SOCIAL_TOKENS.put('ig_user_id', instagramAccounts[0].id);
                await env.SOCIAL_TOKENS.put('ig_username', instagramAccounts[0].username);
            }
        }

        // Return success page
        return new Response(
            `<html>
                <head>
                    <title>Meta pripojené</title>
                    <style>
                        body { 
                            font-family: system-ui; 
                            padding: 2rem; 
                            background: #1a1a1a; 
                            color: white; 
                            text-align: center;
                        }
                        h1 { color: #22c55e; }
                        .info { 
                            background: rgba(255,255,255,0.05); 
                            padding: 1rem; 
                            border-radius: 8px; 
                            margin: 1rem auto;
                            max-width: 400px;
                            text-align: left;
                        }
                        a { 
                            display: inline-block;
                            background: #f97316; 
                            color: white; 
                            padding: 0.75rem 1.5rem;
                            border-radius: 8px;
                            text-decoration: none;
                            margin-top: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <h1>✅ Meta účet prepojený!</h1>
                    
                    <div class="info">
                        <p><strong>Facebook používateľ:</strong> ${userData.name}</p>
                        ${pagesData.data && pagesData.data.length > 0 ? 
                            `<p><strong>Facebook stránka:</strong> ${pagesData.data[0].name}</p>` : 
                            '<p style="color:#f97316;">⚠️ Žiadna Facebook stránka</p>'
                        }
                        ${instagramAccounts.length > 0 ? 
                            `<p><strong>Instagram:</strong> @${instagramAccounts[0].username}</p>` : 
                            '<p style="color:#f97316;">⚠️ Žiadny Instagram business účet</p>'
                        }
                    </div>
                    
                    <a href="/sprava-fk2026/">Späť na správu</a>
                    
                    <script>
                        // Notify parent window if in popup
                        if (window.opener) {
                            window.opener.postMessage({ type: 'META_OAUTH_SUCCESS' }, '*');
                            setTimeout(() => window.close(), 3000);
                        }
                    </script>
                </body>
            </html>`,
            {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            }
        );

    } catch (error) {
        console.error('Meta OAuth error:', error);
        return new Response(
            `<html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení</h1>
                    <p>${error.message}</p>
                    <a href="/sprava-fk2026/" style="color: #f97316;">Späť na správu</a>
                </body>
            </html>`,
            {
                status: 500,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }
}
