'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    CESIUM_BASE_URL: string
  }
}

export default function CesiumEarth() {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const rotationRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!cesiumContainer.current) return

    let isDestroyed = false

    const initCesium = async () => {
      try {
        const Cesium = await import('@cesium/engine')
        
        if (isDestroyed) return

        // 配置 Cesium ion 访问令牌
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0YjNhYzdjYy1iYjJhLTQ4NTctOTRkYi0yZWZiZjU0ZmRkZGQiLCJpZCI6MTg2NDY4LCJpYXQiOjE3MDc4OTg4NzR9.Wd4gqQHxvvBOEBvDlBPAOEWgMvVDVE-OWL_xVGBDGBY'

        // 配置 Cesium 资源路径
        window.CESIUM_BASE_URL = '/static/cesium'

        // 创建地形
        const terrain = await Cesium.createWorldTerrainAsync()
        
        if (isDestroyed) return

        // 创建 Cesium Viewer
        const viewer = new Cesium.Viewer(cesiumContainer.current, {
          terrainProvider: terrain,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
        })

        // 保存 viewer 引用
        viewerRef.current = viewer

        // 设置相机初始位置
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
        })

        // 启用光照和阴影
        viewer.scene.globe.enableLighting = true
        viewer.shadows = true

        // 设置环境光
        viewer.scene.light = new Cesium.DirectionalLight({
          direction: Cesium.Cartesian3.normalize(
            new Cesium.Cartesian3(1, 0, 0),
            new Cesium.Cartesian3()
          ),
        })

        // 添加自转动画
        let lastTime = Date.now()
        const startRotation = () => {
          if (rotationRef.current) return
          
          rotationRef.current = viewer.scene.preRender.addEventListener(() => {
            const now = Date.now()
            const delta = (now - lastTime) / 1000
            lastTime = now
            viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -delta * 0.05)
          })
        }

        // 处理鼠标事件
        let isMouseDown = false
        viewer.canvas.addEventListener('mousedown', () => {
          isMouseDown = true
          if (rotationRef.current) {
            rotationRef.current()
            rotationRef.current = null
          }
        })

        viewer.canvas.addEventListener('mouseup', () => {
          isMouseDown = false
          startRotation()
        })

        viewer.canvas.addEventListener('mouseleave', () => {
          if (isMouseDown) {
            isMouseDown = false
            startRotation()
          }
        })

        // 开始自转
        startRotation()
      } catch (error) {
        console.error('Failed to initialize Cesium:', error)
      }
    }

    initCesium()

    return () => {
      isDestroyed = true
      if (rotationRef.current) {
        rotationRef.current()
      }
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy()
      }
    }
  }, [])

  return (
    <div 
      ref={cesiumContainer} 
      className="w-full h-[600px] relative"
      style={{ 
        cursor: 'grab',
        touchAction: 'none'
      }}
    />
  )
} 