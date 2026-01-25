// Meta OAuth Callback (Facebook + Instagram)
// Endpoint: GET /api/social/oauth/meta/callback
// App: FerkoMedia Pages (ID: 1978184613573878)

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // If error from Meta
    if (error) {
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení</h1>
                    <p>${errorDescription || error}</p>
                    <a href="/sprava-fk2026/" style="color: #f97316;">Späť na správu</a>
                </body>
            </html>`,
            {
                status: 400,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        );
    }

    if (!code) {
        return new Response('Missing code parameter', { status: 400 });
    }

    try {
        const appId = env.META_APP_ID || '1978184613573878';
        const appSecret = env.META_APP_SECRET;
        const redirectUri = `${url.origin}/api/social/oauth/meta/callback`;

        if (!appSecret) {
            throw new Error('META_APP_SECRET nie je nastavený v environment variables');
        }

        // Exchange code for access token
        const tokenResponse = await fetch(
            `https://graph.facebook.com/v24.0/oauth/access_token?` +
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
            `https://graph.facebook.com/v24.0/oauth/access_token?` +
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
            `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${userAccessToken}`
        );
        const userData = await userResponse.json();

        // Get user's pages
        const pagesResponse = await fetch(
            `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
        );
        const pagesData = await pagesResponse.json();

        let pageInfo = null;
        let pageAccessToken = null;

        if (pagesData.data && pagesData.data.length > 0) {
            // Find FerkoMedia Video Marketing page or use first one
            const ferkoMediaPage = pagesData.data.find(p => 
                p.name.toLowerCase().includes('ferkomedia') || 
                p.id === '603164136202656'
            ) || pagesData.data[0];

            pageInfo = {
                id: ferkoMediaPage.id,
                name: ferkoMediaPage.name
            };
            pageAccessToken = ferkoMediaPage.access_token;
        }

        // Store tokens in KV
        if (env.SOCIAL_TOKENS) {
            await env.SOCIAL_TOKENS.put('meta_user_token', userAccessToken);
            await env.SOCIAL_TOKENS.put('meta_user_id', userData.id);
            await env.SOCIAL_TOKENS.put('meta_user_name', userData.name);
            
            if (pageInfo && pageAccessToken) {
                await env.SOCIAL_TOKENS.put('fb_page_id', pageInfo.id);
                await env.SOCIAL_TOKENS.put('fb_page_token', pageAccessToken);
                await env.SOCIAL_TOKENS.put('fb_page_name', pageInfo.name);
            }
        }

        // Return success page
        return new Response(
            `<!DOCTYPE html>
            <html>
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
                        .success { color: #22c55e; }
                        .warning { color: #f97316; }
                    </style>
                </head>
                <body>
                    <h1>✅ Meta účet prepojený!</h1>
                    
                    <div class="info">
                        <p><strong>Facebook používateľ:</strong> ${userData.name}</p>
                        ${pageInfo ? 
                            `<p class="success"><strong>Facebook stránka:</strong> ${pageInfo.name}</p>
                             <p><strong>Page ID:</strong> ${pageInfo.id}</p>` : 
                            '<p class="warning">⚠️ Žiadna Facebook stránka nebola nájdená</p>'
                        }
                    </div>
                    
                    <a href="/sprava-fk2026/">Späť na správu</a>
                    
                    <script>
                        // Notify parent window if in popup
                        if (window.opener) {
                            window.opener.postMessage({ 
                                type: 'META_OAUTH_SUCCESS',
                                page: ${pageInfo ? JSON.stringify(pageInfo) : 'null'}
                            }, '*');
                            setTimeout(() => window.close(), 3000);
                        }
                    </script>
                </body>
            </html>`,
            {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        );

    } catch (error) {
        console.error('Meta OAuth error:', error);
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení</h1>
                    <p>${error.message}</p>
                    <a href="/sprava-fk2026/" style="color: #f97316;">Späť na správu</a>
                </body>
            </html>`,
            {
                status: 500,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        );
    }
}
