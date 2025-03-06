'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function ProjectsPage() {
  const [isStorybookRunning, setIsStorybookRunning] = useState(false)

  // 项目配置数据
  const projects = [
    {
      id: 'storybook',
      title: '组件库',
      description: '使用 Storybook 构建的组件库展示',
      type: 'storybook',
      url: 'http://localhost:6006',
      cover: '/images/storybook-cover.png', // 需要添加封面图
      tags: ['Storybook', 'Components', 'UI'],
    },
    {
      id: 'demo-counter',
      title: '计数器 Demo',
      description: '使用 React + TypeScript 构建的简单计数器示例',
      type: 'demo',
      cover: '/images/counter-demo-cover.png', // 需要添加封面图
      tags: ['React', 'TypeScript', 'Demo'],
    },
    {
      id: 'external-demo',
      title: '外部项目展示',
      description: '通过 iframe 加载的外部项目示例',
      type: 'iframe',
      url: 'https://example.com/demo',
      cover: '/images/external-demo-cover.png', // 需要添加封面图
      tags: ['External', 'iframe'],
    },
  ]

  useEffect(() => {
    // 检查 Storybook 是否在运行
    fetch('http://localhost:6006')
      .then(() => setIsStorybookRunning(true))
      .catch(() => setIsStorybookRunning(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">项目展示</h1>
          <div className="flex gap-4">
            {/* 可以添加筛选按钮等 */}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {projects.map((project) => (
            <Link 
              href={`/projects/${project.id}`} 
              key={project.id}
              className="group bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200"
            >
              <div className="aspect-w-16 aspect-h-9 bg-gray-200 relative">
                {project.cover ? (
                  <Image
                    src={project.cover}
                    alt={project.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {project.type === 'storybook' && !isStorybookRunning && (
                  <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                    未运行
                  </div>
                )}
              </div>
              <div className="p-4 h-[160px] relative">
                <div className="group/title relative">
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 line-clamp-1">
                    {project.title}
                  </h2>
                  <div className="opacity-0 group-hover/title:opacity-100 transition-opacity absolute left-0 top-full mt-1 p-2 bg-gray-900 text-white text-sm rounded-md shadow-lg z-20 pointer-events-none whitespace-normal max-w-xs">
                    {project.title}
                  </div>
                </div>
                <div className="group/desc relative">
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {project.description}
                  </p>
                  <div className="opacity-0 group-hover/desc:opacity-100 transition-opacity absolute left-0 top-full mt-1 p-2 bg-gray-900 text-white text-sm rounded-md shadow-lg z-20 pointer-events-none whitespace-normal max-w-xs">
                    {project.description}
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                  {project.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
} 