import 'next-auth'
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      emailVerified?: Date | null
    } & DefaultSession['user']
  }
} 