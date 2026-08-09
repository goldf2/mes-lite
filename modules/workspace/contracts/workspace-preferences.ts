import { z } from 'zod'
import { workspaceFunctionKeys, workspaceModes } from '@/lib/workspace'

export const workspacePreferenceInputSchema = z.object({
  mode: z.enum(workspaceModes), layout: z.array(z.string()).max(40), pinned: z.array(z.string()).max(40),
})

export const workspaceUsageInputSchema = z.object({ functionKey: z.enum(workspaceFunctionKeys) })
