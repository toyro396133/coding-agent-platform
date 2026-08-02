import { atomFamily, atomWithStorage } from 'jotai/utils'

// Last selected agent
export const lastSelectedAgentAtom = atomWithStorage<string | null>('last-selected-agent', null)

// Per-agent last selected model using atom family
export const lastSelectedModelAtomFamily = atomFamily((agent: string) =>
  atomWithStorage<string | null>(`last-selected-model-${agent}`, null),
)
