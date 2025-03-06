import { allPosts } from 'contentlayer/generated'
import { notFound } from 'next/navigation'
import { useMDXComponent } from 'next-contentlayer/hooks'

interface PostProps {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  return allPosts.map((post) => ({
    slug: post.slug,
  }))
}

export default function PostPage({ params }: PostProps) {
  const post = allPosts.find((post) => post.slug === params.slug)

  if (!post) {
    notFound()
  }

  const MDXComponent = useMDXComponent(post.body.code)

  return (
    <div className="bg-gray-50">
      <article className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">{post.title}</h1>
          <time dateTime={post.date} className="text-gray-500">
            {new Date(post.date).toLocaleDateString('zh-CN')}
          </time>
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
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="prose prose-lg max-w-none">
            <MDXComponent />
          </div>
        </div>
      </article>
    </div>
  )
} 