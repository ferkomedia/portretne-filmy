// LinkedIn OAuth Init - Redirect to LinkedIn login
// Endpoint: GET /api/social/oauth/linkedin

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const clientId = env.LI_CLIENT_ID;
    const redirectUri = `${url.origin}/api/social/oauth/linkedin/callback`;

    if (!clientId) {
        return new Response(
            `<!DOCTYPE html>
            <html>
                <head><title>Chyba</title></head>
                <body style="font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1 style="color: #ef4444;">LinkedIn nie je nakonfigurovaný</h1>
                    <p>Chýba LI_CLIENT_ID v environment variables.</p>
                    <a href="/sprava-fk2026/" style="color: #f97316;">Späť na správu</a>
                </body>
            </html>`,
            { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    // LinkedIn OAuth 2.0 scopes
    const scopes = [
        'openid',
        'profile',
        'w_member_social'
    ].join(' ');

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
        `response_type=code&` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}`;

    return Response.redirect(authUrl, 302);
}
