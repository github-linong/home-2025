'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { data: session } = useSession()

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-gray-900">Home Portal</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-gray-600 hover:text-gray-900">首页</Link>
            <Link href="/blog" className="text-gray-600 hover:text-gray-900">博客</Link>
            <Link href="/projects" className="text-gray-600 hover:text-gray-900">项目</Link>
            <Link href="/about" className="text-gray-600 hover:text-gray-900">关于</Link>

            {/* User Profile / Login Button */}
            <div className="relative">
              {session ? (
                <>
                  <button
                    className="flex items-center space-x-2"
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                  >
                    {session.user?.image ? (
                      <Image
                        src={session.user.image}
                        alt="Profile"
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-600">{session.user?.name?.[0]}</span>
                      </div>
                    )}
                    <span className="text-gray-600">{session.user?.name}</span>
                  </button>
                  {isProfileOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                      <div className="py-1">
                        <button
                          onClick={() => signOut()}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          退出登录
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  登录
                </Link>
              )}
            </div>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200">
            <div className="flex flex-col space-y-4">
              <Link 
                href="/" 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                onClick={() => setIsMenuOpen(false)}
              >
                首页
              </Link>
              <Link 
                href="/blog" 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                onClick={() => setIsMenuOpen(false)}
              >
                博客
              </Link>
              <Link 
                href="/projects" 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                onClick={() => setIsMenuOpen(false)}
              >
                项目
              </Link>
              <Link 
                href="/about" 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                onClick={() => setIsMenuOpen(false)}
              >
                关于
              </Link>
              {!session && (
                <Link
                  href="/auth/signin"
                  className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                  onClick={() => setIsMenuOpen(false)}
                >
                  登录
                </Link>
              )}
              {session && (
                <button
                  onClick={() => {
                    signOut()
                    setIsMenuOpen(false)
                  }}
                  className="text-left text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
                >
                  退出登录
                </button>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
} 