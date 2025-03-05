'use client'

import { MicroFrontendContainer } from './MicroFrontendContainer'

interface ClientMicroFrontendProps {
  url: string
  name: string
}

const ClientMicroFrontend = ({ url, name }: ClientMicroFrontendProps) => {
  return <MicroFrontendContainer url={url} name={name} />
}

export default ClientMicroFrontend 