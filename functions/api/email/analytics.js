// Email Analytics API
// Endpoint: GET /api/email/analytics

export async function onRequestGet(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        // Auth check
        const authHeader = request.headers.get('Authorization');
        const adminKey = authHeader?.replace('Bearer ', '');
        
        if (!adminKey || adminKey !== env.ADMIN_API_KEY) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Neautorizovaný prístup' }),
                { status: 401, headers }
            );
        }

        // Initialize analytics data
        let analytics = {
            overview: {
                totalSent: 0,
                totalDelivered: 0,
                totalOpened: 0,
                totalClicked: 0,
                totalBounced: 0,
                totalComplaints: 0
            },
            rates: {
                deliveryRate: 0,
                openRate: 0,
                clickRate: 0,
                bounceRate: 0,
                complaintRate: 0
            },
            campaigns: [],
            dailyStats: [],
            topLinks: [],
            recentActivity: []
        };

        // Get data from KV
        if (env.EMAIL_MARKETING) {
            // Load campaigns history
            const campaignsList = await env.EMAIL_MARKETING.list({ prefix: 'campaign_' });
            
            for (const key of campaignsList.keys) {
                const campaignData = await env.EMAIL_MARKETING.get(key.name, { type: 'json' });
                if (campaignData) {
                    analytics.campaigns.push({
                        id: key.name,
                        name: campaignData.name || 'Bez názvu',
                        subject: campaignData.subject || '',
                        sentAt: campaignData.sentAt || campaignData.createdAt,
                        recipients: campaignData.recipients || 0,
                        delivered: campaignData.delivered || campaignData.recipients || 0,
                        opened: campaignData.opened || 0,
                        clicked: campaignData.clicked || 0,
                        bounced: campaignData.bounced || 0,
                        complaints: campaignData.complaints || 0
                    });

                    // Aggregate totals
                    analytics.overview.totalSent += campaignData.recipients || 0;
                    analytics.overview.totalDelivered += campaignData.delivered || campaignData.recipients || 0;
                    analytics.overview.totalOpened += campaignData.opened || 0;
                    analytics.overview.totalClicked += campaignData.clicked || 0;
                    analytics.overview.totalBounced += campaignData.bounced || 0;
                    analytics.overview.totalComplaints += campaignData.complaints || 0;
                }
            }

            // Load email events for detailed analytics
            const eventsList = await env.EMAIL_MARKETING.list({ prefix: 'event_' });
            const eventsByDay = {};
            const linkClicks = {};

            for (const key of eventsList.keys) {
                const event = await env.EMAIL_MARKETING.get(key.name, { type: 'json' });
                if (event) {
                    // Aggregate by day
                    const day = event.timestamp ? event.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
                    if (!eventsByDay[day]) {
                        eventsByDay[day] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
                    }
                    
                    switch (event.type) {
                        case 'sent':
                            eventsByDay[day].sent++;
                            break;
                        case 'delivered':
                            eventsByDay[day].delivered++;
                            break;
                        case 'opened':
                            eventsByDay[day].opened++;
                            break;
                        case 'clicked':
                            eventsByDay[day].clicked++;
                            if (event.link) {
                                linkClicks[event.link] = (linkClicks[event.link] || 0) + 1;
                            }
                            break;
                        case 'bounced':
                            eventsByDay[day].bounced++;
                            break;
                    }

                    // Recent activity
                    if (analytics.recentActivity.length < 20) {
                        analytics.recentActivity.push({
                            type: event.type,
                            email: event.email,
                            timestamp: event.timestamp,
                            campaignId: event.campaignId
                        });
                    }
                }
            }

            // Convert daily stats to array
            analytics.dailyStats = Object.entries(eventsByDay)
                .map(([date, stats]) => ({ date, ...stats }))
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 30); // Last 30 days

            // Top clicked links
            analytics.topLinks = Object.entries(linkClicks)
                .map(([url, clicks]) => ({ url, clicks }))
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 10);
        }

        // Calculate rates
        if (analytics.overview.totalSent > 0) {
            analytics.rates.deliveryRate = Math.round((analytics.overview.totalDelivered / analytics.overview.totalSent) * 100);
            analytics.rates.bounceRate = Math.round((analytics.overview.totalBounced / analytics.overview.totalSent) * 100);
        }
        
        if (analytics.overview.totalDelivered > 0) {
            analytics.rates.openRate = Math.round((analytics.overview.totalOpened / analytics.overview.totalDelivered) * 100);
            analytics.rates.clickRate = Math.round((analytics.overview.totalClicked / analytics.overview.totalDelivered) * 100);
            analytics.rates.complaintRate = parseFloat(((analytics.overview.totalComplaints / analytics.overview.totalDelivered) * 100).toFixed(2));
        }

        // Sort campaigns by date (newest first)
        analytics.campaigns.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

        return new Response(
            JSON.stringify({ ok: true, analytics }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Email analytics error:', error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers }
        );
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
