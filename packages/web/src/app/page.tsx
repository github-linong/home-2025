import dynamic from 'next/dynamic'

// const ClientMicroFrontend = dynamic(
//   () => import('@/components/layout/ClientMicroFrontend'),
//   { ssr: false }
// )

export default function Home() {
  return (
    <div className="container mx-auto px-4">
      123
      {/* <ClientMicroFrontend 
        url="http://localhost:3001" 
        name="home-content"
      /> */}
    </div>
  )
} 