import { EventEmitter } from 'events'

export interface IProcessor<T> {
  process(input: T): Promise<T>
  isReady(): boolean
}

export type ProcessorStatus = 'idle' | 'running' | 'error'

export abstract class BaseProcessor extends EventEmitter {
  protected readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }

  abstract process(input: unknown): Promise<unknown>

  getStatus(): ProcessorStatus {
    return 'idle'
  }
}

export class DataProcessor extends BaseProcessor implements IProcessor<string> {
  private count: number = 0

  constructor() {
    super('DataProcessor')
  }

  async process(input: string): Promise<string> {
    this.count++
    return input.trim()
  }

  isReady(): boolean {
    return true
  }

  getCount(): number {
    return this.count
  }
}

export function createProcessor(name: string): DataProcessor {
  return new DataProcessor()
}