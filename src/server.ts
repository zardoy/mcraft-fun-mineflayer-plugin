import { createServer, states } from 'minecraft-protocol'
import { Bot } from 'mineflayer'
import { generateSpiralMatrix } from '@zardoy/flying-squid/dist/utils'
import WebsocketServer from './wsServer'
import exitHook from 'exit-hook'
import ItemLoader from 'prismarine-item'
import { passthroughPackets } from './generalPacketsProxy'
import { MineflayerPacketHandler } from './mineflayerPacketHandler'

export interface MineflayerPluginSettings {
    /** @default 25587 */
    websocketPort?: number
    websocketHost?: string
    /** @default true */
    websocketEnabled?: boolean
    /** @default 25587 */
    tcpPort?: number
    tcpHost?: string
    /** @default true */
    tcpEnabled?: boolean

    resourcePack?: string
    // resourcePackBehavior?: 'server-first' | 'server-last'
}

export const createMineflayerPluginServer = (bot: Bot) => {
    console.log('Starting servers...')

    // #region start servers
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
    // #endregion

    const writeClients = (name: string, data: any, clients?: any[]) => {
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

    const packetHandler = new MineflayerPacketHandler(bot, {
        writeToAuxClients(name, data) {
            writeClients(name, data)
        },
    })


    bot.on('resourcePack', (url) => {
        packetHandler.loginState = 'Bot is waiting for resource pack to be accepted'
    })

    bot._client.on('login', (packet) => {
        packetHandler.loginState = ''
    })
    bot._client.on('respawn', (packet) => {
        // packetHandler.loginState = 'Bot is respawning'
    })

    const newConnection = (client: any, isTcp = false) => {
        packetHandler.handleNewConnection(client)

        client.on('systemChat', (message) => {
            client.write('chat', {
                message: message.formattedMessage,
                position: 0,
                sender: bot.username
            })
        })
        client.on('held_item_slot', () => {
            packetHandler.updateSlot([client])
        })
    }

    tcpServer.on('playerJoin', client => newConnection(client, true))
    wsServer.on('playerJoin', client => newConnection(client, false))

    const hookMethod = <T extends keyof Bot>(_name: T, callback: Function) => {
        const name = _name as string
        const oldMethod = bot[name].bind(bot)
        bot[name] = (...args: any[]) => {
            callback(...args)
            oldMethod(...args)
        }
    }

    // todo patch swingArm
    hookMethod('closeWindow', () => {
        writeClients('closeWindow', {
            windowId: 0
        })
    })

    hookMethod('setQuickBarSlot', () => {
        packetHandler.updateSlot()
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
