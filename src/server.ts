import { createServer, states, Client, Server, ServerClient } from 'minecraft-protocol'
import { Bot } from 'mineflayer'
import { generateSpiralMatrix } from '@zardoy/flying-squid/dist/utils'
import WebsocketServer, { setNextWebsocketOptions } from './wsServer'
import exitHook from 'exit-hook'
import ItemLoader from 'prismarine-item'
import { passthroughPackets } from './generalPacketsProxy'
import { MineflayerPacketHandler } from './mineflayerPacketHandler'
import { registerCustomChannel, UIDefinition, UiLilDef } from './customChannel'
import { networkInterfaces } from 'os'
import { readFileSync } from 'fs'
import { createServer as createHttpsServer, Server as HttpsServer } from 'https'
import { generateSelfSignedCertificate } from './ssl'
import { createStateCaptureFile as createStateCaptureFileBase, PACKETS_REPLAY_FILE_EXTENSION, WORLD_STATE_FILE_EXTENSION } from './worldState'
import { PacketsLogger, parseReplayContents } from './packetsLogger'
import fs from 'fs'

export interface MineflayerPluginSettings {
    /** @default 25587 */
    websocketPort?: number
    websocketHost?: string
    /** @default true */
    websocketEnabled?: boolean
    /** SSL configuration for WebSocket server */
    ssl?: {
        /** @default false */
        enabled?: boolean
        /** @default false - if true, will use a self-signed certificate */
        selfSigned?: boolean
        /** Path to SSL certificate file */
        cert?: string
        /** Path to SSL private key file */
        key?: string
    }
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
    /**
     * Disabling this option is experimental but can help with understanding when bot is disconnected
     * @default true
     */
    stopServersOnDisconnect?: boolean

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
    if (bot.game?.gameMode !== undefined) {
        throw new Error('[mcraft-fun-mineflayer] Bot is already in-game. You MUST register the plugin just right after creating the bot, not in login callback')
    }

    if (options.tcpEnabled !== false && options.websocketEnabled !== false) {
        console.log('Starting servers...')
    }

    // #region start servers
    const TCP_PORT = options.tcpPort ?? 25587
    const WS_PORT = options.websocketPort ?? 25588
    const TCP_HOST = options.tcpHost ?? undefined
    const WS_HOST = options.websocketHost ?? undefined

    let tcpServer: Server | undefined
    let wsServer: Server | undefined
    let httpsServer: HttpsServer | undefined

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

    const websitePreview = 'https://s.mcraft.fun'
    setNextWebsocketOptions(undefined)
    if (options.websocketEnabled !== false) {
        if (options.ssl?.enabled) {
            let sslOptions
            if (options.ssl.selfSigned) {
                sslOptions = generateSelfSignedCertificate()
            } else if (options.ssl.cert && options.ssl.key) {
                sslOptions = {
                    cert: readFileSync(options.ssl.cert),
                    key: readFileSync(options.ssl.key)
                }
            } else {
                console.warn('SSL is enabled but no certificate provided. Falling back to non-SSL.')
            }

            if (sslOptions) {
                httpsServer = createHttpsServer(sslOptions)
                httpsServer.on('request', (req, res) => {
                    // Check if this is a WebSocket upgrade request
                    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
                        res.writeHead(302, {
                            'Location': websitePreview + '/?viewerConnect=wss://' + req.headers.host
                        })
                        res.end()
                        return
                    }
                })
                setNextWebsocketOptions({
                    server: httpsServer
                })
                wsServer = createServer({
                    "online-mode": false,
                    version: bot.version,
                    Server: WebsocketServer as any,
                    port: WS_PORT,
                    host: WS_HOST,
                    customPackets: {},
                })
                httpsServer.listen(WS_PORT, WS_HOST)
            } else {
                wsServer = createServer({
                    "online-mode": false,
                    version: bot.version,
                    Server: WebsocketServer as any,
                    port: WS_PORT,
                    host: WS_HOST,
                    customPackets: {},
                })
            }
        } else {
            wsServer = createServer({
                "online-mode": false,
                version: bot.version,
                Server: WebsocketServer as any,
                port: WS_PORT,
                host: WS_HOST,
                customPackets: {},
            })
        }
        wsServer['options'] = options
    }

    const serverPromises: Promise<void>[] = []
    if (wsServer) {
        serverPromises.push(new Promise<void>(resolve => wsServer.once('listening', resolve)).then(() => console.log('WebSocket server is ready')))
    }
    if (tcpServer) {
        serverPromises.push(new Promise<void>(resolve => tcpServer.once('listening', resolve)).then(() => console.log('TCP server is ready')))
    }

    void Promise.all(serverPromises).then((arr) => {
        if (arr.length === 0) return
        console.log(`Viewer servers are ready:`)
        if (options.showConnectionInstructions !== false) {
            const defaultIp = getDefaultIp()
            if (wsServer) {
                const wsDisplayHost = WS_HOST ?? (!options.ssl?.enabled ? 'localhost' : defaultIp)
                const protocol = options.ssl?.enabled ? 'wss' : 'ws'
                const webLink = options.ssl?.enabled ? `https://${wsDisplayHost}:${WS_PORT}` : `${websitePreview}/?viewerConnect=${protocol}://${wsDisplayHost}:${WS_PORT}`
                console.log(`Web Link: ${webLink}`)
                if (!options.ssl?.enabled) {
                    console.log('Use SSL cert or tunnel like cloudflared to connect from outside the network')
                }
            }
            if (tcpServer) {
                const tcpDisplayHost = TCP_HOST ?? defaultIp
                console.log(`TCP (Vanilla Minecraft): ${tcpDisplayHost}:${TCP_PORT} (${bot.version})`)
            }
        }
    })
    // #endregion

    const fakeClients = [] as { write: (name: string, data: any) => void }[]

    const writeClients = (name: string, data: any, clients?: any[]) => {
        if (clients) {
            for (const client of clients) {
                client.write(name, data)
            }
        } else {
            const getClients = (clients: Record<string, any>) => Object.values(clients).filter(c => c.state === states.PLAY)
            tcpServer?.writeToClients(getClients(tcpServer.clients), name, data)
            wsServer?.writeToClients(getClients(wsServer.clients), name, data)
            fakeClients.forEach(c => c.write(name, data))
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
        packetHandler.loginState = 'in-world'
    })
    bot.on('kicked', (reason) => {
        packetHandler.loginState = `Kicked from server: ${reason}`
    })
    bot.on('end', (reason) => {
        packetHandler.loginState ||= `Disconnected from server`
    })
    bot._client.on('respawn', (packet) => {
        packetHandler.loginState = 'has-respawned'
    })

    // send custom channel packets
    const customChannel = registerCustomChannel(bot, options, () => {
        return [...(tcpServer?.clients ? Object.values(tcpServer.clients) : []), ...(wsServer?.clients ? Object.values(wsServer.clients) : [])]
            .filter((c) => c?.state === states.PLAY)
    })


    const login = (client: ServerClient, isTcp = false) => {
        customChannel.registerChannel(client)
        //@ts-ignore
        if (!client.supportFeature('hasConfigurationState')) {
            newConnection(client, isTcp)
        }
    }
    const newConnection = (client: ServerClient, isTcp = false) => {
        if (client['handledLogin']) return
        client['handledLogin'] = true
        customChannel.registerChannel(client)
        packetHandler.handleNewConnection(client)

        // force selected slot (dont allow viewer to change it)
        client.on('held_item_slot', () => {
            packetHandler.updateSlot([client])
        })

        customChannel.newConnection(client)
        // Send all existing UI definitions to new connection
        for (const [id, def] of uiDefinitions.entries()) {
            customChannel.send({
                type: 'ui',
                update: { id, data: def }
            }, client)
        }

        // Add chat forwarding handler
        if (options.forwardChat) {
            client.on('chat', ({ message }) => {
                bot.chat(message)
            })
            client.on('chat_message', ({ message }) => {
                bot.chat(message)
            })
            client.on('chat_command', ({ command }) => {
                bot.chat(`/${command}`)
            })
            client.on('tab_complete', (packet) => {
                bot._client.write('tab_complete', packet)
                let start = Date.now()
                bot._client.once('tab_complete', (packet) => {
                    if (Date.now() - start > 5000) return
                    client.write('tab_complete', packet)
                })
            })
        }
    }

    const handlePlayerJoin = (client: ServerClient, isTcp = false) => {
        //@ts-ignore
        if (client.supportFeature('hasConfigurationState')) {
            newConnection(client, isTcp)
        }
    }

    tcpServer?.on('playerJoin', client => handlePlayerJoin(client, true))
    wsServer?.on('playerJoin', client => handlePlayerJoin(client, false))
    wsServer?.on('login', client => login(client, false))
    tcpServer?.on('login', client => login(client, true))

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
        if (options.stopServersOnDisconnect !== false) {
            tcpServer?.close()
            wsServer?.close()
            if (httpsServer) httpsServer.close()
        }
    })

    exitHook(() => {
        tcpServer?.close()
        wsServer?.close()
        if (httpsServer) httpsServer.close()
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
                try {
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
                } catch (err) {
                    bot.emit('error', err)
                }
            }
        }
        if (packet.type === 'ui') {
            const lil = lils[packet.id]
            if (lil) {
                const oldValue = lil.params[packet.param];
                if (typeof oldValue === 'function') {
                    try {
                        oldValue()
                    } catch (err) {
                        bot.emit('error', err)
                    }
                } else {
                    if (lil.onUpdate) {
                        lil.params[packet.param] = packet.value
                        try {
                            lil.onUpdate(packet.param, packet.value, oldValue)
                        } catch (err) {
                            bot.emit('error', err)
                        }
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

    let recordingLogger: PacketsLogger | undefined
    const startRecording = (adjustPacketsLogger?: (logger: PacketsLogger) => void) => {
        const stateCaptureFileBase = createStateCaptureFileBase(bot, adjustPacketsLogger);
        recordingLogger = stateCaptureFileBase.logger
        fakeClients.push(stateCaptureFileBase.client)
        newConnection(stateCaptureFileBase.client)
    }

    const stopRecording = (saveFileName?: string) => {
        if (!recordingLogger) throw new Error('No current recording session')
        fakeClients.pop()
        if (saveFileName) {
            fs.writeFileSync(`${saveFileName}.${PACKETS_REPLAY_FILE_EXTENSION}`, recordingLogger.contents)
        }
        recordingLogger = undefined
    }

    const createStateCaptureFile = (fileName?: string, adjustPacketsLogger?: (logger: PacketsLogger) => void) => {
        const { logger: newLogger, client } = createStateCaptureFileBase(bot, adjustPacketsLogger)
        fakeClients.push(client)
        newConnection(client)
        fakeClients.pop()
        if (fileName) {
            fs.mkdirSync(fileName, { recursive: true })
            fs.writeFileSync(`${fileName}.${WORLD_STATE_FILE_EXTENSION}`, newLogger.contents)
        }
        return newLogger
    }

    const unstableApi = {
        createStateCaptureFile,
        startRecording,
        stopRecording,
        debugWorldCapture() {
            console.time('debugWorldCapture')
            const recordingLogger = createStateCaptureFile()
            if (!recordingLogger) throw new Error('No current recording session')

            const contents = recordingLogger.contents
            console.log(`Captured state size: ${contents.length / 1024 / 1024} MB`)
            const { packets } = parseReplayContents(contents)

            // Count total occurrences of each packet
            const packetCounts = {} as Record<string, number>
            for (const packet of packets) {
                const packetName = packet.name
                packetCounts[packetName] = (packetCounts[packetName] || 0) + 1
            }

            // Create flattened sequence of repeated packets
            const packetsFlattened = [] as string[]
            let currentPacket = ''
            let currentCount = 0

            for (const packet of packets) {
                if (packet.name === currentPacket) {
                    currentCount++
                } else {
                    if (currentCount > 0) {
                        packetsFlattened.push(`${currentPacket} ${currentCount}x`)
                    }
                    currentPacket = packet.name
                    currentCount = 1
                }
            }
            if (currentCount > 0) {
                packetsFlattened.push(`${currentPacket} ${currentCount}x`)
            }

            console.log('\nSequential packets:')
            console.log(packetsFlattened.join(', '))

            console.log('\nTotal packet counts:')
            Object.entries(packetCounts)
                .sort(([, a], [, b]) => b - a)
                .forEach(([name, count]) => {
                    console.log(`${name}: ${count}`)
                })

            console.timeEnd('debugWorldCapture')
        }
    };

    const plugin = {
        ui: uiController,
        methods: {} as Record<string, (...args: any[]) => void>,

        _customChannel: customChannel,
        _tcpServer: tcpServer,
        _wsServer: wsServer,
        captureWorldIntoFile: createStateCaptureFile,
        _unstable: unstableApi
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
