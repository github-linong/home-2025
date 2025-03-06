'use client'

import { useEffect, useState } from 'react'

export default function ProjectsPage() {
  const [isStorybookRunning, setIsStorybookRunning] = useState(false)

  useEffect(() => {
    // 检查 Storybook 是否在运行
    fetch('http://localhost:6006')
      .then(() => setIsStorybookRunning(true))
      .catch(() => setIsStorybookRunning(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">组件展示</h1>
        {isStorybookRunning ? (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <iframe
              src="http://localhost:6006"
              className="w-full h-[calc(100vh-12rem)] border-0"
              title="Storybook"
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Storybook 未运行
            </h2>
            <p className="text-gray-600 mb-4">
              请先启动 Storybook 开发服务器：
            </p>
            <div className="bg-gray-100 p-4 rounded-md">
              <code className="text-sm">pnpm storybook dev -p 6006</code>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 