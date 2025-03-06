'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginMethod, setLoginMethod] = useState<'email' | 'password'>('email')

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string

    try {
      const result = await signIn('email', {
        email,
        redirect: false,
      })

      if (result?.error) {
        throw new Error(result.error)
      }

      router.push('/auth/verify-request')
    } catch (error) {
      setError(error instanceof Error ? error.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        throw new Error(result.error)
      }

      const callbackUrl = searchParams.get('callbackUrl') || '/'
      router.push(callbackUrl)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            登录到您的账号
          </h2>
        </div>

        <div className="flex justify-center space-x-4 mb-6">
          <button
            onClick={() => setLoginMethod('email')}
            className={`px-4 py-2 rounded-md ${
              loginMethod === 'email'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            邮箱登录
          </button>
          <button
            onClick={() => setLoginMethod('password')}
            className={`px-4 py-2 rounded-md ${
              loginMethod === 'password'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            密码登录
          </button>
        </div>

        {loginMethod === 'email' ? (
          <form className="mt-8 space-y-6" onSubmit={handleEmailSignIn}>
            <div>
              <label htmlFor="email" className="sr-only">
                邮箱地址
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="邮箱地址"
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? '发送中...' : '发送登录链接'}
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordSignIn}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email" className="sr-only">
                  邮箱地址
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="邮箱地址"
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  密码
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="密码"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </form>
        )}

        <div className="text-center">
          <Link
            href="/auth/signup"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            没有账号？点击注册
          </Link>
        </div>
      </div>
    </div>
  )
} 