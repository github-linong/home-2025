import type { APIRoute } from 'astro';
import { isAllowedDomain } from '../../../config/allowedDomains';

// 添加 getStaticPaths 函数以支持静态部署
export function getStaticPaths() {
    return [];
}

export const GET: APIRoute = async ({ params, request }) => {
    try {
        // 从路径参数中获取 URL
        const encodedUrl = params.url;
        if (!encodedUrl) {
            return new Response('URL 参数缺失', { status: 400 });
        }

        // 解码 URL
        const targetUrl = decodeURIComponent(encodedUrl);

        // 验证域名白名单
        if (!isAllowedDomain(targetUrl)) {
            return new Response('域名不在白名单中', { status: 403 });
        }

        // 发起代理请求
        const response = await fetch(targetUrl, {
            headers: {
                // 传递一些必要的请求头
                'User-Agent': request.headers.get('User-Agent') || '',
                'Accept': request.headers.get('Accept') || '*/*',
                'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9',
            }
        });

        // 获取响应内容
        const data = await response.text();

        // 创建响应头
        const headers = new Headers();

        // 复制原始响应的内容类型
        const contentType = response.headers.get('Content-Type');
        if (contentType) {
            headers.set('Content-Type', contentType);
        }

        // 设置缓存控制
        headers.set('Cache-Control', 'public, max-age=600'); // 缓存 10 分钟

        // 设置 CORS 头
        headers.set('Access-Control-Allow-Origin', '*');

        // 返回代理内容
        return new Response(data, {
            status: response.status,
            headers
        });
    } catch (error) {
        console.error('代理请求失败:', error);
        return new Response('代理请求失败: ' + (error instanceof Error ? error.message : String(error)), {
            status: 500
        });
    }
}; 