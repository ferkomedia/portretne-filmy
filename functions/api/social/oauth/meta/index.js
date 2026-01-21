// Meta OAuth Init - Redirect to Meta login
// Endpoint: GET /api/social/oauth/meta

export async function onRequestGet(context) {
    const { request, env } = context;

    const url = new URL(request.url);
    const appId = env.META_APP_ID;
    const redirectUri = `${url.origin}/api/social/oauth/meta/callback`;

    // Required permissions for Facebook Pages and Instagram
    const scopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments',
        'instagram_manage_insights'
    ].join(',');

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${scopes}&` +
        `response_type=code`;

    return Response.redirect(authUrl, 302);
}
