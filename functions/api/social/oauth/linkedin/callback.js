// LinkedIn OAuth Callback
// Endpoint: GET /api/social/oauth/linkedin/callback

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // If error from LinkedIn
    if (error) {
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení do LinkedIn</h1>
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
        const clientId = env.LI_CLIENT_ID;
        const clientSecret = env.LI_CLIENT_SECRET;
        const redirectUri = `${url.origin}/api/social/oauth/linkedin/callback`;

        if (!clientId || !clientSecret) {
            throw new Error('LinkedIn credentials nie sú nastavené v environment variables');
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            throw new Error(tokenData.error_description || tokenData.error);
        }

        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in; // Usually 60 days (5184000 seconds)

        // Get user profile using OpenID userinfo endpoint
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const profileData = await profileResponse.json();

        // The 'sub' field contains the person URN ID
        const personId = profileData.sub;
        const personUrn = `urn:li:person:${personId}`;
        const profileName = profileData.name || `${profileData.given_name} ${profileData.family_name}`;

        // Store tokens in KV
        if (env.SOCIAL_TOKENS) {
            await env.SOCIAL_TOKENS.put('li_access_token', accessToken);
            await env.SOCIAL_TOKENS.put('li_person_urn', personUrn);
            await env.SOCIAL_TOKENS.put('li_profile_name', profileName);
            await env.SOCIAL_TOKENS.put('li_expires_at', String(Date.now() + (expiresIn * 1000)));
        }

        // Return success page
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head>
                    <title>LinkedIn pripojené</title>
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
                    </style>
                </head>
                <body>
                    <h1>✅ LinkedIn účet prepojený!</h1>
                    
                    <div class="info">
                        <p><strong>Profil:</strong> ${profileName}</p>
                        <p class="success">✓ Pripravený na publikovanie</p>
                    </div>
                    
                    <a href="/sprava-fk2026/">Späť na správu</a>
                    
                    <script>
                        // Notify parent window if in popup
                        if (window.opener) {
                            window.opener.postMessage({ 
                                type: 'LINKEDIN_OAUTH_SUCCESS',
                                profile: { name: '${profileName}' }
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
        console.error('LinkedIn OAuth error:', error);
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head><title>OAuth Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">Chyba pri prihlásení do LinkedIn</h1>
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
