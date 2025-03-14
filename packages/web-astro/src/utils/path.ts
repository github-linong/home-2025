/**
 * 计算从一个路径到另一个路径的相对路径
 * @param from 起始路径
 * @param to 目标路径
 * @returns 相对路径
 */
export function getRelativePath(from: string, to: string): string {
    // 移除开头的斜杠
    from = from.replace(/^\//, '');
    to = to.replace(/^\//, '');

    // 分割路径
    const fromParts = from.split('/').filter(Boolean);
    const toParts = to.split('/').filter(Boolean);

    // 计算共同前缀长度
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
    }

    // 构建相对路径
    const upCount = fromParts.length - i - 1; // 减 1 是因为当前页面名称不计入
    const relativePath = upCount > 0
        ? Array(upCount).fill('..').join('/') + '/' + toParts.slice(i).join('/')
        : './' + toParts.slice(i).join('/');

    return relativePath || './';
} 