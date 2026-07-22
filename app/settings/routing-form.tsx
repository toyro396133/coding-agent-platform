'use client'

import { useState } from 'react'
import { updateDynamicRoute } from '@/lib/actions/routing'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'

interface Route {
  id: string
  subTaskType: string
  model: string
}

export function RoutingForm({ initialRoutes }: { initialRoutes: Route[] }) {
  const [routes, setRoutes] = useState<Route[]>(initialRoutes)

  // These are standard defaults ensuring they always show in the list even if not in DB yet
  const defaultTypes = ['syntax_checker', 'terminal_analyzer', 'patch_writer']

  const displayRoutes = [...routes]
  defaultTypes.forEach((t) => {
    if (!displayRoutes.find((r) => r.subTaskType === t)) {
      displayRoutes.push({ id: `default-${t}`, subTaskType: t, model: 'gpt-4o-mini' })
    }
  })

  const handleUpdate = async (subTaskType: string, newModel: string) => {
    try {
      await updateDynamicRoute(subTaskType, newModel)
      setRoutes((prev) => {
        const existing = prev.find((p) => p.subTaskType === subTaskType)
        if (existing) {
          return prev.map((p) => (p.subTaskType === subTaskType ? { ...p, model: newModel } : p))
        }
        return [...prev, { id: Date.now().toString(), subTaskType, model: newModel }]
      })
      toast.success(`Updated model for ${subTaskType} to ${newModel}`)
    } catch (err) {
      toast.error('Failed to update routing preference')
      console.error(err)
    }
  }

  return (
    <div className="space-y-6">
      {displayRoutes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sub-agents discovered yet.</p>
      ) : (
        <div className="space-y-4">
          {displayRoutes.map((route) => (
            <div key={route.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
              <div className="space-y-1">
                <Label className="text-base">{route.subTaskType}</Label>
                <p className="text-sm text-muted-foreground">Dynamically routed agent type</p>
              </div>
              <div className="w-[200px]">
                <Select value={route.model} onValueChange={(val) => handleUpdate(route.subTaskType, val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                    <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                    <SelectItem value="claude-3-5-haiku">claude-3-5-haiku</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
