// todo split more code

import { Client } from 'minecraft-protocol';
import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity'

export const entityReplicator = (bot: Bot) => {
    const getSpawnPacket = (entity: Entity) => {
        let scaledVelocity = entity.velocity.scaled(8000 / 20) // from fixed-position/second to unit => 1/8000 blocks per tick
        if (bot.supportFeature('fixedPointPosition')) {
            scaledVelocity = scaledVelocity.scaled(1 / 32)
        }
        scaledVelocity = scaledVelocity.floored()

        let entityPosition
        if (bot.supportFeature('fixedPointPosition')) {
            entityPosition = entity.position.scaled(32).floored()
        } else if (bot.supportFeature('doublePosition')) {
            entityPosition = entity.position
        }

        // clamped
        const yaw = Math.max(0, Math.min(255, Math.floor((entity.yaw % 360) * 256 / 360)))
        if (entity.type === 'player') {
            return {
                entityId: entity.id,
                playerUUID: entity.uuid,
                x: entityPosition.x,
                y: entityPosition.y,
                z: entityPosition.z,
                yaw,
                pitch: entity.pitch,
                currentItem: 0,
                metadata: entity.metadata
            }
        } else if (entity.type === 'object') {
            return {
                entityId: entity.id,
                objectUUID: entity.uuid,
                type: entity.entityType,
                x: entityPosition.x,
                y: entityPosition.y,
                z: entityPosition.z,
                pitch: entity.pitch,
                yaw: entity.yaw,
                // todo
                objectData: entity['data'] ?? 0,
                velocityX: scaledVelocity.x,
                velocityY: scaledVelocity.y,
                velocityZ: scaledVelocity.z
            }
        } else if (entity.type === 'mob') {
            return {
                entityId: entity.id,
                entityUUID: entity.uuid,
                type: entity.entityType,
                x: entityPosition.x,
                y: entityPosition.y,
                z: entityPosition.z,
                yaw: entity.yaw,
                pitch: entity.pitch,
                headPitch: entity.pitch,
                velocityX: scaledVelocity.x,
                velocityY: scaledVelocity.y,
                velocityZ: scaledVelocity.z,
                metadata: entity.metadata
            }
        }
        throw new Error(`Unknown entity type: ${entity.type}`)
    }

    const sendEntity = (entity: Entity, client: Client) => {
        let spawnPacketName

        if (entity.type === 'player') spawnPacketName = 'named_entity_spawn'
        else if (entity.type === 'object') spawnPacketName = 'spawn_entity'
        else if (entity.type === 'mob') spawnPacketName = 'spawn_entity_living'

        client.write(spawnPacketName, getSpawnPacket(entity))
    }

    return {
        onClientJoin(client: Client) {
            for (const [id, entity] of Object.entries(bot.entities)) {
                if (String(id) === String(bot.entity.id)) continue
                sendEntity(entity as Entity, client)
            }
        }
    }
}
