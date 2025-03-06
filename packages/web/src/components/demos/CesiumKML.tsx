'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    CESIUM_BASE_URL: string
    Cesium: any
  }
}

export default function CesiumKML() {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)

  useEffect(() => {
    if (!cesiumContainer.current || !window.Cesium) return

    let isDestroyed = false

    const initCesium = async () => {
      try {
        const Cesium = window.Cesium
        
        if (isDestroyed) return

        // 配置 Cesium ion 访问令牌
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0YjNhYzdjYy1iYjJhLTQ4NTctOTRkYi0yZWZiZjU0ZmRkZGQiLCJpZCI6MTg2NDY4LCJpYXQiOjE3MDc4OTg4NzR9.Wd4gqQHxvvBOEBvDlBPAOEWgMvVDVE-OWL_xVGBDGBY'

        // 配置 Cesium 资源路径
        window.CESIUM_BASE_URL = '/demos/cesium'

        // 创建 Cesium Viewer
        const viewer = new Cesium.Viewer(cesiumContainer.current, {
          terrainProvider: await Cesium.createWorldTerrainAsync(),
        })

        // 保存 viewer 引用
        viewerRef.current = viewer

        // 创建一个简单的实体
        const entity = viewer.entities.add({
          name: 'Simple Demo',
          position: Cesium.Cartesian3.fromDegrees(-114.0, 40.0, 300000.0),
          point: {
            pixelSize: 10,
            color: Cesium.Color.YELLOW,
          },
          path: {
            show: true,
            leadTime: 0,
            trailTime: 60,
            width: 10,
            resolution: 1,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              taperPower: 0.3,
              color: Cesium.Color.PALEGOLDENROD,
            }),
          },
        })

        // 添加一个圆形区域
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(-114.0, 40.0),
          name: 'Circle',
          ellipse: {
            semiMinorAxis: 250000.0,
            semiMajorAxis: 250000.0,
            height: 200000.0,
            material: Cesium.Color.BLUE.withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
          },
        })

        // 添加导出 KML 按钮
        const toolbar = document.createElement('div')
        toolbar.className = 'toolbar-left'
        toolbar.style.position = 'absolute'
        toolbar.style.top = '5px'
        toolbar.style.left = '5px'

        const button = document.createElement('button')
        button.className = 'cesium-button'
        button.textContent = '导出 KML'
        button.onclick = () => {
          try {
            const kml = Cesium.exportKml({
              entities: viewer.entities,
              kmz: true,
              defaultCamera: viewer.camera,
            })

            const blob = new Blob([kml], {
              type: 'application/vnd.google-earth.kml+xml',
            })

            const a = document.createElement('a')
            const url = window.URL.createObjectURL(blob)
            a.href = url
            a.download = 'Cesium-Demo.kml'
            a.click()
            window.URL.revokeObjectURL(url)
          } catch (error) {
            console.error('导出 KML 失败:', error)
          }
        }

        toolbar.appendChild(button)
        if (cesiumContainer.current) {
          cesiumContainer.current.appendChild(toolbar)
        }

        // 设置相机视角
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-114.0, 40.0, 1000000.0),
          orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-45.0),
            roll: 0.0,
          },
        })

      } catch (error) {
        console.error('Failed to initialize Cesium:', error)
      }
    }

    initCesium()

    return () => {
      isDestroyed = true
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy()
      }
    }
  }, [])

  return (
    <>
      <Script 
        src="/demos/cesium/Cesium.js" 
        strategy="beforeInteractive"
        onLoad={() => {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = '/demos/cesium/Widgets/widgets.css'
          document.head.appendChild(link)
        }}
      />
      <div 
        ref={cesiumContainer} 
        className="w-full h-[600px] relative"
        style={{ 
          cursor: 'grab',
          touchAction: 'none'
        }}
      />
    </>
  )
} 