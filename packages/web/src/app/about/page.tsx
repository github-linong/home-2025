'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
          <div className="p-8 sm:p-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-8 border-b pb-4">关于我</h1>
            
            <div className="prose prose-lg max-w-none">
              <div className="mb-8">
                <p className="text-gray-600 text-lg leading-relaxed mb-4">
                  你好！我是一名全栈开发者，热衷于探索新技术和分享技术经验。
                  我专注于 Web 开发、移动应用开发和云原生技术。
                </p>
                <p className="text-gray-600 text-lg leading-relaxed">
                  Read-Search-Ask
                </p>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-6 flex items-center">
                <span className="mr-2">联系方式</span>
                <div className="flex-grow h-px bg-gray-200 ml-4"></div>
              </h2>
              <div className="space-y-8">
                <div className="flex items-start space-x-6 bg-gray-50 p-6 rounded-lg transition-all duration-300 hover:bg-gray-100">
                  <div className="flex-shrink-0">
                    <Link href="https://segmentfault.com/u/linong" target="_blank" rel="noopener noreferrer" className="block transform transition-transform duration-300 hover:scale-105">
                      <object
                        data="//w.segmentfault.com/card/1030000005946455.svg?theme=light&bg=f8f9fa"
                        type="image/svg+xml"
                        width={240}
                        height={72}
                        className="rounded-lg shadow-sm"
                      >
                        <a href="https://segmentfault.com/u/linong">linong 的 SegmentFault 技术档案</a>
                      </object>
                    </Link>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">SegmentFault</h3>
                    <p className="text-gray-600 mt-2 leading-relaxed">
                      访问我的 SegmentFault 主页，查看我的技术文章和回答。
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-6 bg-gray-50 p-6 rounded-lg transition-all duration-300 hover:bg-gray-100">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <i className="fas fa-envelope text-blue-500 text-xl"></i>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">邮箱</h3>
                    <a 
                      href="mailto:lilnong1@126.com" 
                      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 mt-2 block"
                    >
                      lilnong1@126.com
                    </a>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-lg transition-all duration-300 hover:bg-gray-100">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">微信公众号：前端linong</h3>
                    <p className="text-gray-600 leading-relaxed max-w-2xl mx-auto">
                      扫描二维码关注我的微信公众号，获取更多技术分享和最新动态。
                      这里会定期发布技术文章、编程心得和行业见解，欢迎关注交流！
                    </p>
                    <p className="text-gray-600 mt-2">
                      微信：LN4518（交个朋友、付费问答、源码）
                    </p>
                  </div>
                  <div className="flex justify-center w-full">
                    <div className="w-full max-w-lg transform transition-transform duration-300 hover:scale-105">
                      <Image
                        src="/images/wx-qrcode.jpg"
                        alt="微信公众号二维码"
                        width={800}
                        height={800}
                        className="w-full h-auto rounded-lg shadow-md"
                        style={{ maxWidth: '100%', height: 'auto' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-6 flex items-center">
                <span className="mr-2">关于本站</span>
                <div className="flex-grow h-px bg-gray-200 ml-4"></div>
              </h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <p className="text-gray-600 leading-relaxed">
                  本站使用 Next.js 14 构建，采用了最新的 App Router 和 Server Components 架构。
                  UI 框架使用 Tailwind CSS，支持响应式设计和暗色模式。
                  博客系统基于 MDX，实现了高度的内容可定制性。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}