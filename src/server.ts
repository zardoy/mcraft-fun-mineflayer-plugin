import { createServer, states, Client, Server } from 'minecraft-protocol'
import { Bot } from 'mineflayer'
import { generateSpiralMatrix } from '@zardoy/flying-squid/dist/utils'
import WebsocketServer from './wsServer'
import exitHook from 'exit-hook'
import ItemLoader from 'prismarine-item'
import { passthroughPackets } from './generalPacketsProxy'
import { MineflayerPacketHandler } from './mineflayerPacketHandler'
import { registerCustomChannel, UIDefinition, UiLilDef } from './customChannel'
import { networkInterfaces } from 'os'

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
    /** @default undefined - no ip filter */
    ipFilter?: string[]
    /** @default true */
    showConnectionInstructions?: boolean
    /** @default undefined - no password protection */
    password?: string

    // resourcePack?: string
    // resourcePackBehavior?: 'server-first' | 'server-last'

    /** @default false */
    allowEval?: boolean
    /** @default false */
    sendConsole?: boolean
    /** @default true */
    sendStats?: boolean
    /** @default false */
    forwardChat?: boolean
}

export const createMineflayerPluginServer = (bot: Bot, options: MineflayerPluginSettings) => {
    console.log('Starting servers...')

    // #region start servers
    const TCP_PORT = options.tcpPort ?? 25587
    const WS_PORT = options.websocketPort ?? 25588
    const TCP_HOST = options.tcpHost ?? undefined
    const WS_HOST = options.websocketHost ?? undefined

    let tcpServer: Server | undefined
    let wsServer: Server | undefined

    if (options.tcpEnabled !== false) {
        if (options.password) {
            console.log('TCP server (Vanilla Minecraft) is disabled because it does not support password')
        } else {
            tcpServer = createServer({
                "online-mode": false,
                version: bot.version,
                port: TCP_PORT,
                host: TCP_HOST,
            })
        }
    }

    if (options.websocketEnabled !== false) {
        wsServer = createServer({
            "online-mode": false,
            version: bot.version,
            Server: WebsocketServer as any,
            port: WS_PORT,
            host: WS_HOST,
            customPackets: {
            },
        })
        wsServer['options'] = options
    }

    const serverPromises: Promise<void>[] = []
    if (wsServer) {
        serverPromises.push(new Promise<void>(resolve => wsServer.once('listening', resolve)).then(() => console.log('WebSocket server is ready')))
    }
    if (tcpServer) {
        serverPromises.push(new Promise<void>(resolve => tcpServer.once('listening', resolve)).then(() => console.log('TCP server is ready')))
    }

    void Promise.all(serverPromises).then(() => {
        console.log(`Viewer servers are ready:`)
        if (options.showConnectionInstructions !== false) {
            const defaultIp = getDefaultIp()
            if (wsServer) {
                const wsDisplayHost = WS_HOST ?? defaultIp
                console.log(`Web Link: https://s.mcraft.fun/?viewerConnect=ws://${wsDisplayHost}:${WS_PORT}`)
            }
            if (tcpServer) {
                const tcpDisplayHost = TCP_HOST ?? defaultIp
                console.log(`TCP (Vanilla Minecraft): ${tcpDisplayHost}:${TCP_PORT} (${bot.version})`)
            }
        }
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

    // send custom channel packets
    const customChannel = registerCustomChannel(bot, options, () => {
        return [...(tcpServer?.clients ? Object.values(tcpServer.clients) : []), ...(wsServer?.clients ? Object.values(wsServer.clients) : [])]
            .filter((c) => c?.state === states.PLAY)
    })


    const newConnection = (client: any, isTcp = false) => {
        customChannel.registerChannel(client)
        customChannel.newConnection(client)
        // Send all existing UI definitions to new connection
        for (const [id, def] of uiDefinitions.entries()) {
            customChannel.send({
                type: 'ui',
                update: { id, data: def }
            }, client)
        }

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

        // Add chat forwarding handler
        if (options.forwardChat) {
            client.on('chat', ({ message }) => {
                bot.chat(message)
            })
            client.on('chat_message', ({ message }) => {
                bot.chat(message)
            })
        }
    }

    tcpServer?.on('playerJoin', client => newConnection(client, true))
    wsServer?.on('playerJoin', client => newConnection(client, false))

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


    // plugin methods


    type LilOptions = Omit<UiLilDef, 'type' | 'params' | 'buttons'> & {
        onUpdate?: (id: string, newValue: any, oldValue: any) => void
    }
    type LilStore = LilOptions & {
        params: {
            [key: string]: number | string | boolean | null | (() => void)
        }
    }
    const lils = {} as Record<string, LilStore>
    // Add storage for UI definitions
    const uiDefinitions = new Map<string, UIDefinition>()

    const sendLil = (id: string) => {
        const lil = lils[id]
        if (!lil) {
            return
        }
        const lilDef = {
            type: 'lil' as const,
            ...lil,
            params: Object.fromEntries(Object.entries(lil.params).filter(x => {
                return typeof x[1] === 'string' || typeof x[1] === 'number' || typeof x[1] === 'boolean'
            }).map(x => {
                return [x[0], x[1] as string | number | boolean]
            })),
            buttons: Object.entries(lil.params).filter(x => typeof x[1] === 'function').map(x => x[0])
        }
        // Store lil definition
        uiDefinitions.set(id, lilDef)
        customChannel.send({
            type: 'ui',
            update: { id, data: lilDef }
        })
    }

    const uiController = {
        updateUI: (id: string, ui: UIDefinition) => {
            uiDefinitions.set(id, ui)
            customChannel.send({
                type: 'ui',
                update: { id, data: ui }
            })
        },
        removeUI: (id: string) => {
            uiDefinitions.delete(id)
            customChannel.send({
                type: 'ui',
                update: { id, data: null }
            })
        },
        updateText: (id: string, text: string) => {
            if (!uiDefinitions.has(id) || uiDefinitions.get(id)?.type !== 'text') {
                return
            }
            const ui = uiDefinitions.get(id) as any
            ui.text = text
            customChannel.send({
                type: 'ui',
                update: { id, data: ui }
            })
        },
        updateLil: (id: string, object: LilStore['params'], params: LilOptions = {}) => {
            lils[id] = {
                ...params,
                params: object
            }
            sendLil(id)
        },
        removeLil: (id: string) => {
            delete lils[id]
            // Remove from storage
            uiDefinitions.delete(id)
            customChannel.send({
                type: 'ui',
                update: { id, data: null }
            })
        }
    }

    const abortController = new AbortController()

    const startTime = Date.now()
    const interval = setInterval(() => {
        if (options.sendStats !== false) {
            customChannel.send({
                type: 'stats',
                botPing: -1,
                botUptime: Date.now() - startTime
            })
        }
    }, 1000)
    abortController.signal.addEventListener('abort', () => {
        clearInterval(interval)
    })

    customChannel.receivedProcessor = (packet) => {
        if (packet.type === 'eval') {
            if (options.allowEval) {
                try {
                    const func = new Function('bot', packet.code)
                    const result = func(bot)
                    customChannel.send({
                        type: 'eval',
                        result: result,
                        isError: false
                    })
                } catch (error) {
                    customChannel.send({
                        type: 'eval',
                        result: String(error),
                        isError: true
                    })
                }
            }
        }
        if (packet.type === 'method') {
            // const allowMethods = options.allowMethods;
            const allowMethods = true
            if (allowMethods) {
                const result = bot[packet.method](...packet.args)
                if (result instanceof Promise) {
                    result.then(result => {
                        customChannel.send({
                            type: 'method',
                            result: result
                        })
                    })
                } else {
                    customChannel.send({
                        type: 'method',
                        result: result
                    })
                }
            }
        }
        if (packet.type === 'ui') {
            const lil = lils[packet.id]
            if (lil) {
                const oldValue = lil.params[packet.param];
                if (typeof oldValue === 'function') {
                    oldValue()
                } else {
                    if (lil.onUpdate) {
                        lil.params[packet.param] = packet.value
                        lil.onUpdate(packet.param, packet.value, oldValue)
                    } else {
                        lil.params[packet.param] = packet.value
                    }
                    // update for other clients
                    sendLil(packet.id)
                }
            }
        }
    }

    // intercept console messages
    if (options.sendConsole) {
        const originalConsole = { ...console }
        const interceptConsole = (method: 'log' | 'warn' | 'error') => {
            console[method] = (...args: any[]) => {
                originalConsole[method](...args)
                customChannel.send({
                    type: 'console',
                    level: method,
                    message: args.map(arg =>
                        typeof arg === 'string' ? arg :
                            typeof arg === 'object' ? JSON.stringify(arg) :
                                String(arg)
                    ).join(' ')
                })
            }
        }

        interceptConsole('log')
        interceptConsole('warn')
        interceptConsole('error')

        // Restore console on cleanup
        abortController.signal.addEventListener('abort', () => {
            Object.assign(console, originalConsole)
        })
    }

    const plugin = {
        ui: uiController,
        methods: {} as Record<string, (...args: any[]) => void>,

        _customChannel: customChannel,
        _tcpServer: tcpServer,
        _wsServer: wsServer,
    }

    bot.webViewer = plugin

    return plugin
}

export type WebViewerPlugin = ReturnType<typeof createMineflayerPluginServer>

declare module 'mineflayer' {
    interface Bot {
        webViewer: WebViewerPlugin
    }
}

const getDefaultIp = () => {
    const interfaces = networkInterfaces()
    // Try common interface names first
    const commonNames = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet']
    for (const name of commonNames) {
        const iface = interfaces[name]
        if (iface?.length) {
            const ipv4 = iface.find(addr => addr.family === 'IPv4' && !addr.internal)
            if (ipv4) return ipv4.address
        }
    }
    // If common names didn't work, try all interfaces
    for (const iface of Object.values(interfaces)) {
        if (!iface) continue
        const ipv4 = iface.find(addr => addr.family === 'IPv4' && !addr.internal)
        if (ipv4) return ipv4.address
    }
    return 'localhost'
}
