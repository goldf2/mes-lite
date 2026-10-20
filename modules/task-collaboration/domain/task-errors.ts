export class TaskCollaborationDomainError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'INVALID_REFERENCE') {
    super(message)
    this.name = 'TaskCollaborationDomainError'
  }
}
