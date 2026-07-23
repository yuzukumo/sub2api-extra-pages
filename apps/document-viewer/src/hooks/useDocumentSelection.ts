import { useCallback, useEffect, useState } from 'react'

function readDocumentFile(): string | undefined {
  return new URLSearchParams(window.location.search).get('doc') || undefined
}

export function useDocumentSelection() {
  const [selectedFile, setSelectedFile] = useState<string | undefined>(readDocumentFile)

  useEffect(() => {
    const handlePopState = () => setSelectedFile(readDocumentFile())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const selectDocument = useCallback((file: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('doc', file)
    url.hash = ''
    window.history.pushState(null, '', url)
    setSelectedFile(file)
    window.scrollTo({ top: 0 })
  }, [])

  const replaceDocument = useCallback((file: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('doc', file)
    window.history.replaceState(null, '', url)
    setSelectedFile(file)
  }, [])

  return { selectedFile, selectDocument, replaceDocument }
}
