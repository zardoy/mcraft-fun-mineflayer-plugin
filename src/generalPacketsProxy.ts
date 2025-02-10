import { Client } from 'minecraft-protocol';
import PrismarineItem from 'prismarine-item';

export const passthroughPackets = [
    // Entity-related packets
    'named_entity_spawn',
    'spawn_entity', // TODO re-capture
    'spawn_entity_living',
    'spawn_entity_painting',
    'spawn_entity_experience_orb',
    'entity_velocity',
    'destroy_entity',
    'rel_entity_move',
    'entity_look',
    'entity_move_look',
    'entity_teleport',
    'entity_metadata',
    'entity_status',
    'attach_entity',
    'entity_effect',
    'remove_entity_effect',
    'experience',

    // World and block updates
    'map_chunk',
    'multi_block_change',
    'block_change',
    'block_action',
    'block_break_animation',
    'explosion',
    'world_event',

    // Player and health updates
    'player_info',
    'update_health',
    'respawn',
    'position',
    'held_item_slot',

    // Time update
    'update_time',

    // Inventory and window updates
    'set_slot',
    'window_items',

    // Sound and particle effects
    'named_sound_effect',
    'sound_effect',
    'entity_sound_effect',
    'world_particles',

    // Scoreboard
    'scoreboard_objective',
    'scoreboard_score',
    'scoreboard_display_objective',

    // Teams
    'teams',

    // Additional gameplay features
    'statistics',
    'abilities',
    'unlock_recipes',
    'declare_commands',
    'tags',

    // Misc
    'open_window',
    'close_window',
    'custom_payload',
    'kick_disconnect',
    'game_state_change',

    'chat', // todo re-capture
    'difficulty',
    'title',
    'clear_titles',
    'initialize_world_border',
    'world_border_center',
    'world_border_lerp_size',
    'world_border_size',
    'world_border_warning_delay',
    'world_border_warning_reach',
    'set_title_subtitle',
    'set_title_text',
    'set_title_time',
    'simulation_distance',
    'player_chat',
    'system_chat',
    'server_data', // todo might not need,
    'chat_suggestions',
    'hide_message',
    'profileless_chat',
    'player_remove',
    'feature_flags',
    'chunk_biomes',
    'damage_event',
    'hurt_animation',

    'bed',
    'map_chunk_bulk',
    'update_sign',
    'world_border',
    'set_compression',
    'update_entity_nbt',
    'combat_event',
    'transaction',
    'entity_destroy', // Replaced with 'destroy_entity' in the list
    'spawn_entity_weather',
    //   'open_sign_entity' // Updated in later versions
];


export type AuxClientsState = {
    auxClients?: Client[];
    writeToAuxClients?: (name: string, data: any) => void;
};

export const handleAuxClientsProxy = (serverConnection: Client, state: AuxClientsState) => {
    if (!state.auxClients && !state.writeToAuxClients) throw new Error('No aux clients or writeToAuxClients provided')
    const lastPackets = {
        login: null as any,
        position: null as any,
        player_info: null as any,
    }

    serverConnection.on('login', (packet) => {
        lastPackets.login = packet
    })

    serverConnection.on('packet', (data, { name }) => {
        if (!(name in lastPackets)) return
        lastPackets[name] = data
    })

    const writeToAuxClients = (name: string, data: any, clients?: Client[]) => {
        if (clients) {
            clients.forEach(client => {
                client.write(name, data)
            })
        } else {
            state.auxClients?.forEach(client => {
                client.write(name, data)
            })
            state.writeToAuxClients?.(name, data)
        }
    }

    for (const passthroughPacket of passthroughPackets) {
        serverConnection.on(passthroughPacket, (data) => {
            writeToAuxClients(passthroughPacket, data)
        })
    }


    const writeMainClientPackets = (name: string, data: any) => {
        if (name === 'position') {
            Object.assign(lastPackets.position, data)
            writePosition()
        }
        if (name === 'position_look') {
            Object.assign(lastPackets.position, data)
            writePosition()
        }
        if (name === 'look') {
            Object.assign(lastPackets.position, data)
            writePosition()
        }

        if (name === 'block_dig') {
            if (data.status === 0) {
                // start digging
                writeToAuxClients('block_break_animation', {
                    location: data.location,
                    progress: 0,
                    entityId: lastPackets.login.entityId
                })
            }
            if (data.status === 1) {
                // stop digging
                writeToAuxClients('block_break_animation', {
                    location: data.location,
                    progress: -1,
                    entityId: lastPackets.login.entityId
                })
            }
        }

        if (name === 'arm_animation') {
            writeToAuxClients('animation', {
                entityId: lastPackets.login.entityId,
                animation: data.hand === 0 ? 0 : 1
            })
        }
    }

    const writePosition = () => {
        writeToAuxClients('position', {
            ...lastPackets.position,
            flags: 0x00,
            teleportId: 1
        })
    }

    const Item = PrismarineItem(serverConnection.version)

    const onNewAuxConnection = (client: Client) => {
        if (!lastPackets.login) {
            client.end(`Bot was not logged in yet: ${client.state}`)
            return
        }

        client.write('login', lastPackets.login)
        client.write('player_info', lastPackets.player_info)

        // client.write('spawn_position', {
        //     location: bot.entity.position,
        //     angle: 0,
        // })

        writeToAuxClients('held_item_slot', { slot: 0 })
        writePosition()

        client.write('window_items', {
            windowId: 0,
            stateId: 1,
            items: [].map(item => Item.toNotch(item)),
            carriedItem: Item.toNotch(null)
        })
    }

    return {
        lastPackets,
        onNewAuxConnection,
        writeMainClientPackets,
        writeToAuxClients,
        Item
    }
}
