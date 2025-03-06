'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'

export default function Header() {
  const { data: session, status } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 当状态不是 loading 时，添加一个小延迟再显示内容
    if (status !== 'loading') {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [status])

  const handleSignOut = () => {
    setIsMenuOpen(false)
    signOut()
  }

  return (
    <header className="bg-white shadow">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-indigo-600">Home</span>
            </Link>
          </div>

          <div className="flex items-center">
            {status === 'loading' ? (
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <span className="text-gray-500">加载中...</span>
              </div>
            ) : (
              <div
                className={`transition-opacity duration-300 ${
                  isVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {session ? (
                  <div className="relative">
                    <button
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="flex items-center space-x-2 focus:outline-none"
                    >
                      {session.user?.image ? (
                        <Image
                          src={session.user.image}
                          alt={session.user?.name || '用户头像'}
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-600 font-medium">
                            {session.user?.name?.[0] || session.user?.email?.[0] || '?'}
                          </span>
                        </div>
                      )}
                      <span className="text-gray-700">{session.user?.name || session.user?.email}</span>
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1">
                        <Link
                          href="/profile"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          个人资料
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          退出登录
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center space-x-4">
                    <Link
                      href="/auth/signin"
                      className="text-gray-700 hover:text-indigo-600"
                    >
                      登录
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                    >
                      注册
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
} 