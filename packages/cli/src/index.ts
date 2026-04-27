#!/usr/bin/env node

import 'reflect-metadata'
import { Command } from 'commander'
import { indexCommand } from './commands/index'
import { statusCommand } from './commands/status'
import { searchCommand } from './commands/search'

const program = new Command()

program
    .name('spyglass')
    .description('Index your codebase locally and find exactly what you are looking for')
    .version('0.1.0')

program.addCommand(indexCommand)
program.addCommand(statusCommand)
program.addCommand(searchCommand)

program.parse(process.argv)
