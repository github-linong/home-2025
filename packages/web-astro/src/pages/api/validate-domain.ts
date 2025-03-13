import type { APIRoute } from 'astro';
import { isAllowedDomain } from '../../config/allowedDomains';

export const GET: APIRoute = async ({ url }) => {
    try {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            return new Response('URL parameter is required', { status: 400 });
        }

        const isAllowed = isAllowedDomain(decodeURIComponent(targetUrl));
        if (!isAllowed) {
            return new Response('Domain not allowed', { status: 403 });
        }

        return new Response('OK', { status: 200 });
    } catch (e) {
        console.error('Error validating domain:', e);
        return new Response('Invalid URL', { status: 400 });
    }
}; 