"use client"

import * as React from "react"

type AiContextState = {
  contextText: string | null
  contextLabel: string | null
}

type AiContextValue = AiContextState & {
  setAiContext: (text: string | null, label: string | null) => void
  clearAiContext: () => void
}

const AiCtx = React.createContext<AiContextValue>({
  contextText: null,
  contextLabel: null,
  setAiContext: () => {},
  clearAiContext: () => {},
})

export function AiContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AiContextState>({
    contextText: null,
    contextLabel: null,
  })

  const setAiContext = React.useCallback((text: string | null, label: string | null) => {
    setState({ contextText: text, contextLabel: label })
  }, [])

  const clearAiContext = React.useCallback(() => {
    setState({ contextText: null, contextLabel: null })
  }, [])

  return (
    <AiCtx.Provider value={{ ...state, setAiContext, clearAiContext }}>
      {children}
    </AiCtx.Provider>
  )
}

export function useAiContext() {
  return React.useContext(AiCtx)
}
