import NextAuth, { DefaultSession } from 'next-auth'
import Email from 'next-auth/providers/email'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { createTransport } from 'nodemailer'
import { SocksProxyAgent } from 'socks-proxy-agent'

// 扩展 Session 类型以包含 id
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']
})

// 生成用户头像的函数
const generateAvatar = (email: string) => {
  const seed = encodeURIComponent(email)
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

const handler = NextAuth({
  debug: true,
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Email({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
        secure: true,
        proxy: `socks5h://${process.env.EMAIL_SERVER_PROXY_HOST}:${process.env.EMAIL_SERVER_PROXY_PORT}`,
      },
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({
        identifier: email,
        url,
        provider: { server, from },
      }) {
        const transport = createTransport({
          ...server,
          proxy: server.proxy,
          agent: new SocksProxyAgent(server.proxy),
        })
        
        const result = await transport.sendMail({
          to: email,
          from,
          subject: `登录验证 - ${process.env.NEXTAUTH_URL}`,
          text: `请点击以下链接完成登录：\n${url}\n\n如果这不是您的操作，请忽略此邮件。`,
          html: `
            <div style="background-color: #f9fafb; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <h2 style="color: #1f2937; margin-bottom: 16px;">登录验证</h2>
                <p style="color: #4b5563; margin-bottom: 24px;">请点击以下按钮完成登录：</p>
                <a href="${url}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-bottom: 24px;">完成登录</a>
                <p style="color: #6b7280; font-size: 14px;">如果按钮无法点击，请复制以下链接到浏览器：<br>${url}</p>
                <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">如果这不是您的操作，请忽略此邮件。</p>
              </div>
            </div>
          `,
        })
        
        console.log('Email sent:', result)
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
  },
  session: {
    strategy: 'database'
  },
  callbacks: {
    async session({ session, user }) {
      if (session?.user) {
        session.user.id = user.id
        // 如果用户没有头像，生成一个
        if (!session.user.image) {
          const avatar = generateAvatar(session.user.email || '')
          // 更新数据库中的用户头像
          await prisma.user.update({
            where: { id: user.id },
            data: { image: avatar }
          })
          session.user.image = avatar
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    }
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('User signed in:', { user, account, profile, isNewUser })
      // 如果是新用户或没有头像，生成一个
      if (isNewUser || !user.image) {
        const avatar = generateAvatar(user.email || '')
        await prisma.user.update({
          where: { id: user.id },
          data: { image: avatar }
        })
      }
    },
    async createUser({ user }) {
      console.log('New user created:', user)
      // 为新用户生成头像
      const avatar = generateAvatar(user.email || '')
      await prisma.user.update({
        where: { id: user.id },
        data: { image: avatar }
      })
    },
    async linkAccount({ user, account, profile }) {
      console.log('Account linked:', { user, account, profile })
    },
    async session({ session, token }) {
      console.log('Session updated:', { session, token })
    }
  }
})

export { handler as GET, handler as POST } 