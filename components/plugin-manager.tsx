'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Puzzle, Plus, Trash2, Loader2 } from 'lucide-react'
import { useLocale } from '@/components/providers/locale-provider'

interface Plugin {
  name: string
  source: string
}

interface PluginManagerProps {
  className?: string
}

export function PluginManager({ className }: PluginManagerProps) {
  const { t } = useLocale()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [pluginName, setPluginName] = useState('')
  const [pluginSource, setPluginSource] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchPlugins = async () => {
    try {
      const res = await fetch('/api/plugins')
      const data = await res.json()
      setPlugins(data.plugins || [])
    } catch (e) {
      console.error('Failed to fetch plugins:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlugins()
  }, [])

  const addPlugin = async () => {
    if (!pluginName.trim() || !pluginSource.trim()) return
    setAdding(true)
    try {
      await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pluginName.trim(), source: pluginSource.trim() }),
      })
      setPluginName('')
      setPluginSource('')
      await fetchPlugins()
    } catch (e) {
      console.error('Failed to add plugin:', e)
    } finally {
      setAdding(false)
    }
  }

  const removePlugin = async (name: string) => {
    try {
      await fetch(`/api/plugins?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      await fetchPlugins()
    } catch (e) {
      console.error('Failed to remove plugin:', e)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Puzzle className="h-4 w-4" />
          Extensions / Plugins
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Plugin name..."
            value={pluginName}
            onChange={(e) => setPluginName(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Input
            placeholder="Source path..."
            value={pluginSource}
            onChange={(e) => setPluginSource(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={addPlugin} disabled={adding || !pluginName || !pluginSource}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No plugins registered</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {plugins.map((plugin) => (
              <div key={plugin.name} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Puzzle className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-xs font-medium truncate">{plugin.name}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {plugin.source}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePlugin(plugin.name)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
