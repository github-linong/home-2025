'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const CesiumKML = dynamic(() => import('@/components/demos/CesiumKML'), {
  ssr: false,
})

// 项目配置数据
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
    id: 'cesium-kml',
    title: 'Cesium KML 导出演示',
    description: '使用 Cesium.js 构建的 KML 导出功能演示',
    type: 'iframe',
    url: '/demos/ExportKML.html',
    tags: ['Cesium', '3D', 'KML'],
  },
  {
    id: 'demo-counter',
    title: '计数器 Demo',
    description: '使用 React + TypeScript 构建的简单计数器示例',
    type: 'demo',
    tags: ['React', 'TypeScript', 'Demo'],
  },
  {
    id: 'external-demo',
    title: '外部项目展示',
    description: '通过 iframe 加载的外部项目示例',
    type: 'iframe',
    url: 'https://example.com/demo',
    tags: ['External', 'iframe'],
  },
]

export default function ProjectPage() {
  const params = useParams()
  const [isStorybookRunning, setIsStorybookRunning] = useState(false)
  const project = projects.find(p => p.id === params.id)

  useEffect(() => {
    if (project?.type === 'storybook') {
      fetch('http://localhost:6006/iframe.html?id=Components-Button--primary')
        .then(() => setIsStorybookRunning(true))
        .catch(() => setIsStorybookRunning(false))
    }
  }, [project])

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">项目未找到</h1>
        <Link 
          href="/projects"
          className="text-blue-600 hover:text-blue-800 transition-colors"
        >
          返回项目列表
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link 
            href="/projects"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            ← 返回项目列表
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{project.title}</h1>
            <p className="text-gray-600 mb-6">{project.description}</p>
            
            <div className="flex flex-wrap gap-2 mb-8">
              {project.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="h-[600px] bg-gray-100 rounded-lg overflow-hidden">
              {project.type === 'storybook' && (
                isStorybookRunning ? (
                  <iframe
                    src="http://localhost:6006/iframe.html?id=Components-Button--primary"
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-600 mb-4">
                        Storybook 服务未运行。请先启动 Storybook：
                      </p>
                      <pre className="bg-gray-200 p-4 rounded inline-block">
                        pnpm storybook
                      </pre>
                    </div>
                  </div>
                )
              )}
              {project.type === 'iframe' && (
                <iframe
                  src={project.url}
                  className="w-full h-full border-0"
                />
              )}
              {project.type === 'demo' && (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-gray-600">Demo 内容开发中...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 