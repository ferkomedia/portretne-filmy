// Meta OAuth Callback (Facebook Pages)
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
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white; text-align: center;">
                    <h1 style="color: #ef4444;">❌ Chyba pri prihlásení</h1>
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

        if (!appId || !appSecret) {
            throw new Error('Meta credentials nie sú nastavené');
        }

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

        const userAccessToken = longTokenData.access_token;

        // Get user info
        const userResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${userAccessToken}`
        );
        const userData = await userResponse.json();

        // Get user's pages
        const pagesResponse = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${userAccessToken}`
        );
        const pagesData = await pagesResponse.json();

        let pageInfo = null;

        // Store tokens in KV
        if (env.SOCIAL_TOKENS) {
            await env.SOCIAL_TOKENS.put('meta_user_token', userAccessToken);
            await env.SOCIAL_TOKENS.put('meta_user_id', userData.id);
            await env.SOCIAL_TOKENS.put('meta_user_name', userData.name);
            
            if (pagesData.data && pagesData.data.length > 0) {
                // Store first page's token (page tokens don't expire if user token is long-lived)
                const page = pagesData.data[0];
                await env.SOCIAL_TOKENS.put('fb_page_id', page.id);
                await env.SOCIAL_TOKENS.put('fb_page_token', page.access_token);
                await env.SOCIAL_TOKENS.put('fb_page_name', page.name);
                pageInfo = page;
            }
        }

        // Return success page
        return new Response(
            `<html>
                <head>
                    <title>Facebook pripojené</title>
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
                        .info p { margin: 0.5rem 0; }
                        .warning {
                            background: rgba(249,115,22,0.1);
                            border: 1px solid #f97316;
                            padding: 1rem;
                            border-radius: 8px;
                            margin: 1rem auto;
                            max-width: 400px;
                            color: #f97316;
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
                    <h1>✅ Facebook účet prepojený!</h1>
                    
                    <div class="info">
                        <p><strong>Používateľ:</strong> ${userData.name}</p>
                        ${pageInfo ? 
                            `<p><strong>Stránka:</strong> ${pageInfo.name}</p>` : 
                            ''
                        }
                    </div>
                    
                    ${!pageInfo ? `
                        <div class="warning">
                            ⚠️ Nemáš žiadnu Facebook stránku.<br>
                            Pre publikovanie potrebuješ Facebook Page.
                        </div>
                    ` : ''}
                    
                    <p style="font-size: 0.875rem; color: rgba(255,255,255,0.6);">
                        📌 Instagram vyžaduje App Review.<br>
                        Zatiaľ môžeš publikovať len na Facebook.
                    </p>
                    
                    <a href="/sprava-fk2026/">Späť na správu</a>
                    
                    <script>
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
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white; text-align: center;">
                    <h1 style="color: #ef4444;">❌ Chyba pri prihlásení</h1>
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
