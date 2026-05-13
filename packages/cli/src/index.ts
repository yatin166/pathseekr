#!/usr/bin/env node

import 'reflect-metadata'
import { Command } from 'commander'
import { indexCommand } from './commands/index'
import { statusCommand } from './commands/status'
import { searchCommand } from './commands/search'
import { embedCommand } from './commands/embed'
import { workspaceCommand } from './commands/workspace'

const program = new Command()

program
  .name('pathseekr')
  .description('Index your codebase locally and find exactly what you are looking for')
  .version('0.1.0')

program.addCommand(indexCommand)
program.addCommand(statusCommand)
program.addCommand(searchCommand)
program.addCommand(embedCommand)
program.addCommand(workspaceCommand)

program.parse(process.argv)