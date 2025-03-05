import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">关于我们</h3>
            <p className="text-gray-600">
              一个现代化的门户网站框架，支持微前端架构。
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">快速链接</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/blog" className="text-gray-600 hover:text-gray-900">
                  博客
                </Link>
              </li>
              <li>
                <Link href="/projects" className="text-gray-600 hover:text-gray-900">
                  项目
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-gray-600 hover:text-gray-900">
                  关于
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">联系方式</h3>
            <ul className="space-y-2 text-gray-600">
              <li>邮箱：contact@example.com</li>
              <li>电话：+86 123 4567 8900</li>
              <li>地址：中国</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-200 text-center text-gray-600">
          <p>© 2024 Home Portal. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
} 