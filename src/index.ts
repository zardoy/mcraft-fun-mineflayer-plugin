import type { Bot, BotEvents } from 'mineflayer'
import { WebSocket, WebSocketServer } from 'ws'

interface Options {
    connectInstructions?: boolean
    port?: number
    wss?: WebSocketServer
    /**
     * @default [] - allow any IP
     */
    allowIps?: string[]
    /**
     * @default Infinity
     */
    maxClients?: number
    /**
     * @default "*"
     */
    cors?: string
    /**
     * @default [] - passthrough all bot events
     */
    disableSendingEvents?: (keyof BotEvents)[]
    remoteCodeExecution?: {
        /**
         * @default false
         */
        enabled?: boolean
        /**
         * @default [] - allow any IP
         */
        allowedIps?: string[]
    }
    consoleOutput?: {
        /**
         * @default false
         */
        enabled?: boolean
        /**
         * @default false
         */
        hideStdout?: boolean
        /**
         * @default false
         */
        hideStderr?: boolean
        /**
         * @default [] - allow any IP
         */
        allowedIps?: string[]
    }
    // remoteInputControl?: {
    //     /**
    //      * @default false
    //      */
    //     enabled?: boolean
    //     /**
    //      * @default [] - allow any IP
    //      */
    //     allowedIps?: string[]
    // }
    hideData?: {
        // players?: boolean
        // entities?: boolean
        // username?: boolean
        // serverIp?: boolean
        // version?: boolean
        // viewersCount?: boolean
    }
}

export interface CustomRendererEvents {
    botSync: any
    viewersCount: number
    loadChunk: {
        chunkJson: string
    }
}

type Connection = {
    ws: WebSocket
    ip: string
    connectedSince: number
}

export default (options: Options = {}) => {
    return (bot: Bot) => {
        const disabledEvents = [
            'chat',
            'whisper',
            'error',
            'message',
            'messagestr',
            'unmatchedMessage',
            'inject_allowed',
            'actionBar'
        ] satisfies (keyof BotEvents)[] as (keyof BotEvents)[]
        const wss = options.wss ?? new WebSocketServer({
            port: options.port ?? 3800,
        })

        const connections = [] as Connection[]
        wss.on('connection', (ws, req) => {
            const ip = req.connection.remoteAddress ?? ''
            if (options.allowIps && !options.allowIps.includes(ip)) {
                // todo send message to client
                ws.close()
                return
            }
            connections.push({
                ws,
                ip: req.connection.remoteAddress ?? '',
                connectedSince: Date.now(),
            })

            if (bot.game.levelType) {
                sendEventToClient(ws, 'login')
            }
        })
        const sendEventToClient = (client: WebSocket | undefined, event: keyof BotEvents, ...args: any[]) => {
            if (disabledEvents.includes(event) || options.disableSendingEvents?.includes(event)) {
                return
            }

            const data = JSON.stringify({
                event,
                args,
            })
            client?.send(data)
        }
        const sendCustomEvent = <T extends keyof CustomRendererEvents>(clients: null | WebSocket[], event: T, ...args: CustomRendererEvents[T]) => {
            clients ??= connections.map(c => c.ws)
            const data = JSON.stringify({
                customEvent: event,
                args,
            })
            for (const client of clients) {
                client.send(data)
            }
        }

        // passthorugh all bot events
        const sendEventToClients = (event: keyof BotEvents, ...args: any[]) => {
            for (const connection of connections) {
                sendEventToClient(connection.ws, event, ...args)
            }
        }
        const oldEmit = bot.emit.bind(bot)
        bot.emit = (event, ...args) => {
            sendEventToClients(event, ...args)
            // sendEventToClient(undefined, event, ...args)
            return oldEmit(event, ...args)
        }
    }
}

declare module 'mineflayer' {
    interface Bot {
        webConnector: {
            connections: Connection[]
        }
    }
}
