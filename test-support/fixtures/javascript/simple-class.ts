export const SIMPLE_CLASS = `
    import { EventEmitter } from 'events'
    import path from 'path'
    
    export class BaseProcessor extends EventEmitter {
        constructor(name) {
            super()
            this.name = name
        }
    
        process(input) {
            return input.trim()
        }
    
        getName() {
            return this.name
        }
    
        _internalHelper() {
            // private by convention — should not be extracted
        }
    }
    
    export class DataProcessor extends BaseProcessor {
        #count = 0
    
        constructor() {
            super('DataProcessor')
        }
    
        process(input) {
            this.#count++
            return input.trim().toLowerCase()
        }
    
        getCount() {
            return this.#count
        }
    
        reset() {
            this.#count = 0
        }
    }
    
    export function createProcessor(name) {
        return new DataProcessor()
    }
    
    export const formatResult = (result) => {
        return result.toUpperCase()
    }
    
    export const processAsync = async (input) => {
        return input.trim()
    }
`