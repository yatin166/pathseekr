import 'reflect-metadata'
import { Container } from 'inversify'
import { DatabaseConnection } from '@pathseekr/core/storage/database'
import { TYPES } from '@pathseekr/core/container/types'

export function createTestDatabase(): DatabaseConnection {
  const container = new Container()

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(':memory:')

  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  return container.get<DatabaseConnection>(TYPES.DatabaseConnection)
}