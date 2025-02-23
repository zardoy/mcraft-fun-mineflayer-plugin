import { Socket } from 'net'
import { WebSocketServer, WebSocket } from 'ws'
import ServerDefault from 'minecraft-protocol/src/server'
import { states, Client } from 'minecraft-protocol'

const clientIgnoredPackets = [
    'position'
]

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
    relayConnection: WebSocket | null = null
    relayServerId: string | null = null

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
            const ws = new WebSocketServer({ port })
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
                // Connect to relay server when local server is ready
                this.connectToRelay()
            })
        }
    }

    private connectToRelay() {
        const relayUrl = process.env.RELAY_URL || 'ws://localhost:8080'
        this.relayConnection = new WebSocket(relayUrl)

        this.relayConnection.on('open', () => {
            console.log('Connected to relay server')
            // Register as a server
            this.relayConnection!.send(JSON.stringify({
                type: 'register',
                role: 'server',
                version: this.version,
                username: 'minecraft-server'
            }))
        })

        this.relayConnection.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString())
                if (message.type === 'registered') {
                    this.relayServerId = message.id
                    console.log('Registered with relay server, ID:', message.id)
                } else if (message.type === 'packet') {
                    // Handle incoming packets from relay clients
                    // Forward them to the appropriate local client
                    for (const clientId in this.clients) {
                        const client = this.clients[clientId]
                        if (client.state === states.PLAY) {
                            client.write(message.data.name, message.data.params)
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing relay message:', error)
            }
        })

        this.relayConnection.on('close', () => {
            console.log('Disconnected from relay server, attempting to reconnect...')
            setTimeout(() => this.connectToRelay(), 5000)
        })

        this.relayConnection.on('error', (error) => {
            console.error('Relay connection error:', error)
        })
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

        // Forward all packets to relay server
        client.on('packet', (data, meta) => {
            if (this.relayConnection?.readyState === WebSocket.OPEN && this.relayServerId) {
                this.relayConnection.send(JSON.stringify({
                    type: 'packet',
                    data: {
                        name: meta.name,
                        params: data
                    }
                }))
            }
        })
    }

    close() {
        if (this.relayConnection) {
            this.relayConnection.close()
        }

        for (const clientId of Object.keys(this.clients)) {
            const client = this.clients[clientId]
            client.end('ServerShutdown')
        }

        this.socketServer.close()
    }

    writeToClients(clients, name, params) {
        if (clients.length === 0) return
        const buffer = this.serializer.createPacketBuffer({ name, params })
        for (const client of clients) client.writeRaw(buffer)

        // Also forward to relay server
        if (this.relayConnection?.readyState === WebSocket.OPEN && this.relayServerId) {
            this.relayConnection.send(JSON.stringify({
                type: 'packet',
                data: {
                    name,
                    params
                }
            }))
        }
    }
}
