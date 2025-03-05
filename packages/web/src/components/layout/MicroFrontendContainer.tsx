'use client'

import { useEffect, useRef } from 'react'

interface MicroFrontendContainerProps {
  url: string
  name: string
}

export function MicroFrontendContainer({ url, name }: MicroFrontendContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadMicroFrontend = async () => {
      try {
        // 这里可以根据需要实现不同的微前端加载策略
        // 1. iframe 方式
        if (containerRef.current) {
          const iframe = document.createElement('iframe')
          iframe.src = url
          iframe.style.width = '100%'
          iframe.style.height = '100%'
          iframe.style.border = 'none'
          containerRef.current.appendChild(iframe)
        }

        // 2. 动态加载方式
        // const script = document.createElement('script')
        // script.src = url
        // script.async = true
        // document.body.appendChild(script)
      } catch (error) {
        console.error(`Failed to load micro frontend ${name}:`, error)
      }
    }

    loadMicroFrontend()

    return () => {
      // 清理工作
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [url, name])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full min-h-[calc(100vh-4rem)]"
      id={`micro-frontend-${name}`}
    />
  )
} 