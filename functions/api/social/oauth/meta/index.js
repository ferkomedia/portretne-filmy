// Meta OAuth Init - Redirect to Meta login
// Endpoint: GET /api/social/oauth/meta

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const appId = env.META_APP_ID;
    const redirectUri = `${url.origin}/api/social/oauth/meta/callback`;

    if (!appId) {
        return new Response('META_APP_ID nie je nastavené v Environment Variables', { status: 500 });
    }

    // Permissions for Facebook Pages (Development mode compatible)
    // Note: For Instagram, you need to complete App Review first
    const scopes = [
        'public_profile',
        'pages_show_list',
        'pages_manage_posts'
    ].join(',');

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${scopes}&` +
        `response_type=code`;

    return Response.redirect(authUrl, 302);
}
