import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('avatar') as File
    if (!file) {
      return NextResponse.json(
        { error: '请选择要上传的头像' },
        { status: 400 }
      )
    }

    // 这里应该添加文件上传到云存储的逻辑
    // 为了演示，我们使用 DiceBear API 生成头像
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(session.user.email)}-${Date.now()}`

    // 更新用户头像
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { image: avatarUrl },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
  } catch (error) {
    console.error('更新头像错误:', error)
    return NextResponse.json(
      { error: '更新失败，请稍后重试' },
      { status: 500 }
    )
  }
} 