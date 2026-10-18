import { z } from 'zod'
import { workspaceFunctionKeys, workspaceModes } from '@/lib/workspace'

export const workspacePreferenceInputSchema = z.object({
  mode: z.enum(workspaceModes), layout: z.array(z.string()).max(workspaceFunctionKeys.length), pinned: z.array(z.string()).max(workspaceFunctionKeys.length),
})

export const workspaceUsageInputSchema = z.object({ functionKey: z.enum(workspaceFunctionKeys) })
