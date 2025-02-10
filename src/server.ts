import { createServer, states } from 'minecraft-protocol'
import { Bot } from 'mineflayer'
import { generateSpiralMatrix } from '@zardoy/flying-squid/dist/utils'
import WebsocketServer from './wsServer'
import exitHook from 'exit-hook'
import ItemLoader from 'prismarine-item'
import { passthroughPackets } from './packetsProxyConfiguration'

export const createServerA = (bot: Bot) => {
    console.log('Starting servers...')

    // TODO extract logic so it can be reused on mcraft.fun

    const Item = ItemLoader(bot.version)

    const TCP_PORT = 25587
    const WS_PORT = 25588
    const tcpServer = createServer({
        "online-mode": false,
        version: bot.version,
        port: TCP_PORT,
    })
    const wsServer = createServer({
        "online-mode": false,
        version: bot.version,
        Server: WebsocketServer as any,
        port: WS_PORT,
        customPackets: {

        },
    })
    void Promise.all([
        new Promise<void>(resolve => wsServer.once('listening', resolve)).then(() => console.log('WebSocket server is ready')),
        new Promise<void>(resolve => tcpServer.once('listening', resolve)).then(() => console.log('TCP server is ready')),
    ]).then(() => {
        console.log(`Viewer servers are ready:`)
        console.log(`Web Link: https://s.mcraft.fun/?viewerConnect=ws://localhost:${WS_PORT}`)
        console.log(`TCP (Vanilla Minecraft): localhost:${TCP_PORT} (${bot.version})`)
    })

    let status = ''
    const lastPackets = {
        login: null as any,
    }

    bot.on('resourcePack', (url) => {
        status = 'Bot is waiting for resource pack to be accepted'
    })

    bot._client.on('login', (packet) => {
        status = ''
        lastPackets.login = packet
    })
    bot._client.on('respawn', (packet) => {
        // status = 'Bot is respawning'
    })

    const writeClients = (name, data, clients?) => {
        if (clients) {
            for (const client of clients) {
                client.write(name, data)
            }
        } else {
            const getClients = (clients: Record<string, any>) => Object.values(clients).filter(c => c.state === states.PLAY)
            tcpServer?.writeToClients(getClients(tcpServer.clients), name, data)
            wsServer?.writeToClients(getClients(wsServer.clients), name, data)
        }
    }
    const updateSlot = (clients?) => {
        writeClients('held_item_slot', { slot: bot.quickBarSlot }, clients)
    }
    const updateHealth = (clients?) => {
        writeClients('update_health', {
            food: bot.food,
            foodSaturation: bot.foodSaturation,
            health: bot.health
        }, clients)
    }
    const updatePosition = (clients?) => {
        writeClients('position', {
            x: bot.entity.position.x,
            y: bot.entity.position.y,
            z: bot.entity.position.z,
            yaw: bot.entity.yaw,
            pitch: bot.entity.pitch,
            flags: 0x00,
            teleportId: 1
        }, clients)
    }

    const newConnection = (client, isTcp = false) => {
        if (!lastPackets.login) {
            client.end(`Bot was not logged in yet: ${status}`)
            return
        }
        lastPackets.login.gameMode = bot.player.gamemode
        client.write('login', lastPackets.login)

        // client.write('spawn_position', {
        //     location: bot.entity.position,
        //     angle: 0,
        // })

        updateSlot([client])
        updatePosition([client])
        updateHealth([client])

        client.write('abilities', {
            flags: 0,
            walkingSpeed: 0,
            flyingSpeed: 0
        })

        client.write('window_items', {
            windowId: 0,
            stateId: 1,
            items: bot.inventory.slots.map(item => Item.toNotch(item)),
            carriedItem: Item.toNotch(bot.heldItem)
        })

        console.log(`sending chunks to new client viewer (${isTcp ? 'TCP' : 'WebSocket'})`)

        const botChunk = bot.entity.position.floored().scale(1 / 16).floored()
        for (const [xRel, zRel] of generateSpiralMatrix(8)) {
            const x = xRel + botChunk.x;
            const z = zRel + botChunk.z;
            const chunk = bot.world.getColumn(x, z) as any
            if (!chunk) continue
            const dumpedLights = chunk.dumpLight()
            const newLightsFormat = bot.supportFeature('newLightingDataFormat')
            const newLightsData = newLightsFormat ? { skyLight: dumpedLights.skyLight, blockLight: dumpedLights.blockLight } : undefined
            const chunkBuffer = chunk.dump()
            const bitMap = chunk.getMask()
            client.write('map_chunk', {
                x,
                z,
                groundUp: bitMap !== undefined ? true : undefined,
                //note: it's a flag that tells the client to trust the edges of the chunk, meaning that the client can render the chunk without having to wait for the edges to be sent
                trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
                bitMap: bitMap,
                biomes: chunk.dumpBiomes(),
                ignoreOldData: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
                heightmaps: {
                    type: 'compound',
                    name: '',
                    value: {
                        MOTION_BLOCKING: { type: 'longArray', value: new Array(bot.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) }, // must be
                        WORLD_SURFACE: { type: 'longArray', value: new Array(bot.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) },
                    }
                }, // FIXME: fake heightmap
                chunkData: chunkBuffer,
                blockEntities: [],
                skyLightMask: chunk.skyLightMask,
                // skyLightMask: [chunk.skyLightMask.data],
                emptySkyLightMask: chunk.emptySkyLightMask,
                blockLightMask: chunk.blockLightMask,
                emptyBlockLightMask: chunk.emptyBlockLightMask,
                ...newLightsData
            })
        }

        client.on('systemChat', (message) => {
            client.write('chat', {
                message: message.formattedMessage,
                position: 0,
                sender: bot.username
            })
        })
        client.on('held_item_slot', () => {
            updateSlot([client])
        })
    };
    tcpServer.on('playerJoin', client => newConnection(client, true))
    wsServer.on('playerJoin', client => newConnection(client, false))

    bot.on('move', () => {
        updatePosition()
        updateHealth()
    })
    bot.on('health', () => {
        updatePosition()
    })

    for (const passthroughPacket of passthroughPackets) {
        bot._client.on(passthroughPacket, (data) => {
            // todo send raw packet data instead
            writeClients(passthroughPacket, data)
        })
    }

    const hookMethod = <T extends keyof Bot>(_name: T, callback: Function) => {
        const name = _name as string
        const oldMethod = bot[name].bind(bot)
        bot[name] = (...args: any[]) => {
            callback(...args)
            oldMethod(...args)
        }
    }

    // todo patch _client instead
    // todo patch swingArm
    hookMethod('closeWindow', () => {
        writeClients('closeWindow', {
            windowId: 0
        })
    })

    hookMethod('setQuickBarSlot', () => {
        updateSlot()
    })

    bot.on('end', () => {
        tcpServer?.close()
        wsServer?.close()
    })

    exitHook(() => {
        tcpServer?.close()
        wsServer?.close()
    })
}
