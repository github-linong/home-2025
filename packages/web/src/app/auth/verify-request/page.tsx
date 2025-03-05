'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

export default function VerifyRequest() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    // 使用 email 作为种子生成固定的头像
    const seed = encodeURIComponent(email)
    setAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`)

    const timer = setTimeout(() => {
      router.push('/auth/signin')
    }, 5000)

    return () => clearTimeout(timer)
  }, [router, email])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center">
          {avatarUrl && (
            <div className="w-24 h-24 relative mb-4">
              <Image
                src={avatarUrl}
                alt="User Avatar"
                fill
                className="rounded-full"
                priority
              />
            </div>
          )}
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            验证邮件已发送
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            请检查您的邮箱 {email && <span className="font-medium">{email}</span>}
          </p>
          <p className="mt-2 text-center text-sm text-gray-500">
            5秒后将自动返回登录页面...
          </p>
        </div>
      </div>
    </div>
  )
} 