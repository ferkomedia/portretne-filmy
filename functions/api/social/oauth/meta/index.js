// Meta OAuth Init - Redirect to Meta login
// Endpoint: GET /api/social/oauth/meta
// App: FerkoMedia Pages (ID: 1978184613573878)

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const appId = env.META_APP_ID || '1978184613573878';
    const redirectUri = `${url.origin}/api/social/oauth/meta/callback`;

    // Required permissions for Facebook Pages
    const scopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'public_profile'
    ].join(',');

    const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?` +
        `client_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${scopes}&` +
        `response_type=code`;

    return Response.redirect(authUrl, 302);
}
