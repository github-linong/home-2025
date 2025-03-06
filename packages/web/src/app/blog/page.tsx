import { allPosts, Post } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'

function PostCard(post: Post) {
  return (
    <div className="mb-8 p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
      <h2 className="text-xl font-bold mb-2">
        <Link href={post.url} className="text-blue-600 hover:text-blue-800">
          {post.title}
        </Link>
      </h2>
      <time dateTime={post.date} className="text-gray-500 text-sm">
        {new Date(post.date).toLocaleDateString('zh-CN')}
      </time>
      <p className="mt-2 text-gray-600">{post.description}</p>
      {post.tags && (
        <div className="mt-4 space-x-2">
          {post.tags.map((tag: string) => (
            <span
              key={tag}
              className="inline-block bg-gray-100 rounded-full px-3 py-1 text-sm font-semibold text-gray-600"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BlogPage() {
  const posts = allPosts.sort((a: Post, b: Post) =>
    compareDesc(new Date(a.date), new Date(b.date))
  )

  return (
    <div className="bg-gray-50">
      <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">博客文章</h1>
        <div className="space-y-6">
          {posts.map((post: Post, idx: number) => (
            <PostCard key={idx} {...post} />
          ))}
        </div>
      </div>
    </div>
  )
} 