// 允许的域名列表
export const allowedDomains = [
    'lilnong.top',
    'www.lilnong.top',
    'localhost',
    '127.0.0.1'
];

// 检查URL是否来自允许的域名
export function isAllowedDomain(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
    } catch {
        return false;
    }
}

// 获取URL的域名
export function getDomainFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return '';
    }
} 