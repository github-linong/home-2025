import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { compare, hash } from 'bcryptjs'

export async function PUT(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { currentPassword, newPassword } = await req.json()

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: '用户不存在或未设置密码' },
        { status: 400 }
      )
    }

    // 验证当前密码
    const isValid = await compare(currentPassword, user.password)
    if (!isValid) {
      return NextResponse.json(
        { error: '当前密码错误' },
        { status: 400 }
      )
    }

    // 更新密码
    const hashedPassword = await hash(newPassword, 12)
    await prisma.user.update({
      where: { email: session.user.email },
      data: { password: hashedPassword },
    })

    return NextResponse.json({ message: '密码更新成功' })
  } catch (error) {
    console.error('更新密码错误:', error)
    return NextResponse.json(
      { error: '更新失败，请稍后重试' },
      { status: 500 }
    )
  }
} 