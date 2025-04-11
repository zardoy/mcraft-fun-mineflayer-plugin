import { Socket } from 'net'
import { WebSocketServer as WsServerCore } from 'ws'
import ServerDefault from 'minecraft-protocol/src/server'
import { states, Client } from 'minecraft-protocol'

const clientIgnoredPackets = [
    'position'
]

let nextWebsocketOptions: {
    server: any
} | undefined

export function setNextWebsocketOptions(options: typeof nextWebsocketOptions) {
    nextWebsocketOptions = options
}

class WebsocketConnectionSocket extends Socket {
    ws: import('ws').WebSocket
    id = ''

    constructor(ws: import('ws').WebSocket, versionData, passwordValidation) {
        super()
        this.ws = ws
        let isFirstMessage = true
        let dropMessages = false

        this.ws.on('message', (data) => {
            if (dropMessages) return
            // if data is string "version" then output info
            if (isFirstMessage && Buffer.isBuffer(data) && Buffer.from(data).toString() === 'version') {
                this.ws.send(JSON.stringify(versionData))
                this.end()
                return
            }
            if (isFirstMessage && passwordValidation) {
                if (!Buffer.isBuffer(data) || Buffer.from(data).toString() !== passwordValidation) {
                    dropMessages = true
                    setTimeout(() => {
                        this.ws.send(JSON.stringify({
                            error: 'Invalid password'
                        }))
                        this.end()
                    }, 500)
                    return
                }
                isFirstMessage = false
                return
            }
            isFirstMessage = false
            // console.log('message', data)
            this.emit('data', data)
        })

        this.ws.on('close', () => {
            this.emit('end')
        })

        this.on('end', () => {
            this.ws.close()
        })

        this.ws.on('error', err => {
            this.emit('error', err)
        })
    }

    override write(data, callback) {
        // console.debug('write', data)
        this.ws.send(data, callback)
        return true
    }

    //@ts-expect-error
    end() {
        this.ws.close()
    }
}

export default class WebsocketServer extends (ServerDefault as any) {
    i = 0
    clientsPerIp = {}

    listen(port, host) {
        // implement it with websocket instead
        // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
        const self = this
        if (port === undefined) {
            this.socketServer = {
                close() {
                    // self.emit('close')
                },
            }
        } else {
            let server
            if (nextWebsocketOptions?.server) {
                server = nextWebsocketOptions.server
            }

            const ws = new WsServerCore({
                port: server ? undefined : port,
                server: server,
                host
            })

            this.socketServer = ws
            ws.on('connection', (webSocket, req) => {
                self.newConnection(webSocket, req)
            })
            self.socketServer.on('error', err => {
                self.emit('error', err)
            })
            self.socketServer.on('close', () => {
                self.emit('close')
            })
            self.socketServer.on('listening', () => {
                self.emit('listening')
            })
        }
    }

    newConnection(webSocket, req) {
        // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
        const self = this
        const _socket = webSocket
        const versionData = {
            time: Date.now(),
            version: this.version,
            replEnabled: this.options.allowEval === true,
            consoleEnabled: this.options.sendConsole === true,
            requiresPass: Boolean(this.options.password),
            forwardChat: this.options.forwardChat === true,
            apiVersion: -1
            // todo
        }
        const socket = new WebsocketConnectionSocket(_socket, versionData, this.options.password)
        //@ts-expect-error
        const client: Client & { id } = new Client(true, this.version, this.customPackets, this.hideErrors)
        //@ts-expect-error
        client._end = client.end
        client.end = function (endReason, fullReason = JSON.stringify({ text: endReason })) {
            if (client.state === states.PLAY) {
                client.write('kick_disconnect', { reason: fullReason })
            } else if (client.state === states.LOGIN) {
                client.write('disconnect', { reason: fullReason })
            }

            //@ts-expect-error
            client._end(endReason)
        }

        const ip: string =
            req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split?.(',')?.[0] || req.connection?.remoteAddress || req.socket.remoteAddress

        // Check IP whitelist if configured
        if (Array.isArray(this.options.ipFilter)) {
            if (!this.options.ipFilter.includes(ip)) {
                client.end('Your IP is not whitelisted')
                return
            }
        }

        _socket.remoteAddress = ip
        client.id = ip + this.i++
        socket.id = client.id
        this.clients[client.id] = client
        this.clientsPerIp[ip] ??= 0
        this.clientsPerIp[ip]++
        if (this.clientsPerIp[ip] > 3) {
            client.end('Too many connections from your IP')
            return
        }

        client.on('end', () => {
            delete self.clients[client.id]
            self.clientsPerIp[ip]--
        })
        //@ts-expect-error
        client.setSocket(socket)
        this.emit('connection', client)
    }

    close() {
        for (const clientId of Object.keys(this.clients)) {
            const client = this.clients[clientId]
            client.end('ServerShutdown')
        }

        this.socketServer.close()
    }

    writeToClients(clients, name, params) {
        if (clients.length === 0) return
        try {
            const buffer = this.serializer.createPacketBuffer({ name, params })
            for (const client of clients) client.writeRaw(buffer)
        } catch (err) {
            console.error(`Something went wrong with sending packet ${name} to ${clients.length} clients with params ${JSON.stringify(params)}`)
            console.error(err)
        }
    }
}
