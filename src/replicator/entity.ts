// todo split more code

import { Client } from 'minecraft-protocol';
import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity'

const versionToNumber = (version: string) => {
    const [major, minor, patch] = version.split('.').map(Number)
    return (major ?? 0) * 10000 + (minor ?? 0) * 100 + (patch ?? 0)
}

export const entityReplicator = (bot: Bot) => {
    class EntitySpawnState {
        constructor(public packetType: string, public packet: any) {
        }

        updatePosition(packet) {
            if ('x' in packet) this.packet.x = packet.x;
            if ('y' in packet) this.packet.y = packet.y;
            if ('z' in packet) this.packet.z = packet.z;
        }

        updateRelativePosition(packet) {
            // if (versionToNumber(bot.version) < versionToNumber('1.8')) {
            this.packet.x += packet.dX;
            this.packet.y += packet.dY;
            this.packet.z += packet.dZ;
            // } else {
            //     // 1.8+ uses fixed-point numbers
            //     this.packet.x += packet.dX / 32;
            //     this.packet.y += packet.dY / 32;
            //     this.packet.z += packet.dZ / 32;
            // }
            // 1.8+ has onGround
            if ('onGround' in packet) {
                this.packet.onGround = packet.onGround;
            }
        }

        updateRotation(packet) {
            if ('yaw' in packet) this.packet.yaw = packet.yaw;
            if ('pitch' in packet) this.packet.pitch = packet.pitch;
        }

        updateVelocity(packet) {
            if ('velocityX' in this.packet) {
                this.packet.velocityX = packet.velocityX;
                this.packet.velocityY = packet.velocityY;
                this.packet.velocityZ = packet.velocityZ;
            }
        }

        handleUpdatePacket(packetType, packet) {
            switch (packetType) {
                case 'rel_entity_move':
                    this.updateRelativePosition(packet);
                    break;
                case 'entity_look':
                    this.updateRotation(packet);
                    if ('onGround' in packet) this.packet.onGround = packet.onGround;
                    break;
                case 'entity_move_look':
                    this.updateRelativePosition(packet);
                    this.updateRotation(packet);
                    break;
                case 'entity_teleport':
                    this.updatePosition(packet);
                    this.updateRotation(packet);
                    break;
                case 'sync_entity_position':
                    this.updatePosition(packet);
                    this.updateRotation(packet);
                    this.updateVelocity(packet);
                    break;
                case 'entity_velocity':
                    this.updateVelocity(packet);
                    break;
            }
        }
    }

    class EntityAdditionalState {
        constructor(public entityId: string, public lastPackets: Map<string, any> = new Map()) {
        }

        handleAdditionalPacket(packetType, packet) {
            this.lastPackets.set(packetType, packet);
        }

        getLastPacket(packetType) {
            return this.lastPackets.get(packetType);
        }
    }

    const entities = new Map<string, {
        spawnState: EntitySpawnState,
        additional: EntityAdditionalState
    }>();

    function handleEntityPacket(packetType, packet) {
        const entityId = packet.entityId;

        // Handle spawn packets
        if (packetType.startsWith('spawn_') || packetType === 'named_entity_spawn') {
            entities.set(entityId, {
                spawnState: new EntitySpawnState(packetType, packet),
                additional: new EntityAdditionalState(entityId)
            });
            return;
        }

        const entity = entities.get(entityId);
        if (!entity) return;

        // Check if it's a spawn-modifying packet
        if (['rel_entity_move', 'entity_look', 'entity_move_look',
            'entity_teleport', 'sync_entity_position', 'entity_velocity'].includes(packetType)) {
            entity.spawnState.handleUpdatePacket(packetType, packet);
        } else {
            // It's an additional state packet
            entity.additional.handleAdditionalPacket(packetType, packet);
        }
    }

    function getAllEntityPackets(entityId) {
        const entity = entities.get(entityId);
        if (!entity) return [] as [string, any][];

        const packets = [[entity.spawnState.packetType, entity.spawnState.packet]]; // Spawn packet is always up to date

        // Add all additional state packets
        for (const [packetType, packet] of entity.additional.lastPackets) {
            packets.push([packetType, packet]);
        }

        return packets;
    }

    bot._client.on('packet', (data, packetMeta, buffer, fullBuffer) => {
        if (!data) return
        handleEntityPacket(packetMeta.name, data)
    })

    bot.on('entityGone', ({ id }) => {
        entities.delete(String(id))
    })
    bot.on('respawn', () => {
        entities.clear()
    })

    return {
        onClientJoin(client: Client) {
            for (const [id, entity] of Object.entries(bot.entities)) {
                if (String(id) === String(bot.entity.id)) continue
                const entityPackets = getAllEntityPackets(id)
                for (const [packetType, packet] of entityPackets) {
                    client.write(packetType, packet)
                }
            }
        }
    }
}
