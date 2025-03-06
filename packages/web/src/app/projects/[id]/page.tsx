'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// 项目配置数据（实际项目中应该从 API 或配置文件获取）
const projects = [
  {
    id: 'storybook',
    title: '组件库',
    description: '使用 Storybook 构建的组件库展示',
    type: 'storybook',
    url: 'http://localhost:6006',
    tags: ['Storybook', 'Components', 'UI'],
  },
  {
    id: 'demo-counter',
    title: '计数器 Demo',
    description: '使用 React + TypeScript 构建的简单计数器示例',
    type: 'demo',
    tags: ['React', 'TypeScript', 'Demo'],
    component: () => {
      const [count, setCount] = useState(0)
      return (
        <div className="flex flex-col items-center justify-center p-8">
          <p className="text-2xl mb-4">计数器: {count}</p>
          <div className="space-x-4">
            <button
              onClick={() => setCount(count + 1)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              增加
            </button>
            <button
              onClick={() => setCount(count - 1)}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              减少
            </button>
          </div>
        </div>
      )
    },
  },
  {
    id: 'external-demo',
    title: '外部项目展示',
    description: '通过 iframe 加载的外部项目示例',
    type: 'iframe',
    url: 'https://example.com/demo',
    height: '600px',
    tags: ['External', 'iframe'],
  },
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [isStorybookRunning, setIsStorybookRunning] = useState(false)
  
  const project = projects.find(p => p.id === params.id)
  
  useEffect(() => {
    if (project?.type === 'storybook') {
      fetch('http://localhost:6006')
        .then(() => setIsStorybookRunning(true))
        .catch(() => setIsStorybookRunning(false))
    }
  }, [project])

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">项目未找到</h2>
          <Link href="/projects" className="text-blue-600 hover:text-blue-800">
            返回项目列表
          </Link>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    switch (project.type) {
      case 'storybook':
        if (!isStorybookRunning) {
          return (
            <div className="p-8 text-center bg-white rounded-lg shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Storybook 未运行
              </h3>
              <p className="text-gray-600 mb-4">
                请先启动 Storybook 开发服务器：
              </p>
              <div className="bg-gray-100 p-4 rounded-md">
                <code className="text-sm">pnpm storybook dev -p 6006</code>
              </div>
            </div>
          )
        }
        return (
          <iframe
            src={project.url}
            className="w-full h-[calc(100vh-12rem)] border-0 rounded-lg shadow-sm"
            title={project.title}
          />
        )
      case 'demo':
        if (project.component) {
          const Component = project.component
          return (
            <div className="bg-white rounded-lg shadow-sm">
              <Component />
            </div>
          )
        }
        return null
      case 'iframe':
        return (
          <iframe
            src={project.url}
            className="w-full border-0 rounded-lg shadow-sm"
            style={{ height: project.height }}
            title={project.title}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/projects"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回项目列表
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{project.title}</h1>
          </div>
          <div className="flex gap-2">
            {project.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600">{project.description}</p>
        </div>

        {renderContent()}
      </div>
    </div>
  )
} 