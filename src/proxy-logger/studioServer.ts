import { WebSocket, WebSocketServer } from 'ws'
import { states, States } from 'minecraft-protocol'

interface PacketData {
    connectionIndex: number
    isFromServer: boolean
    name: string
    data: any
    buffer?: Buffer
    timestamp: number
    type: 'packet'
    state: States
}

interface ClientDisconnectData {
    connectionIndex: number
    type: 'clientDisconnect'
    timestamp: number
}

export type WSMessage = PacketData | ClientDisconnectData

let wss: WebSocketServer | null = null
const clients = new Set<WebSocket>()

export function createPacketsStudioServer(port: number = 8089) {
    if (wss) return

    wss = new WebSocketServer({ port })

    wss.on('connection', (ws) => {
        console.log('PacketsStudio client connected')
        clients.add(ws)

        ws.on('close', () => {
            console.log('PacketsStudio client disconnected')
            clients.delete(ws)
        })
    })

    console.log(`PacketsStudio WebSocket server started on port ${port}`)
}

export function handlePacket(connectionIndex: number, isFromServer: boolean, name: string, data: any, state: States, buffer?: Buffer) {
    if (!wss || clients.size === 0) return

    const message: PacketData = {
        connectionIndex,
        isFromServer,
        name,
        data,
        buffer: buffer ? Buffer.from(buffer) : undefined,
        timestamp: Date.now(),
        type: 'packet',
        state
    }

    broadcastMessage(message)
}

export function handleClientDisconnect(connectionIndex: number) {
    if (!wss || clients.size === 0) return

    const message: ClientDisconnectData = {
        connectionIndex,
        type: 'clientDisconnect',
        timestamp: Date.now()
    }

    broadcastMessage(message)
}

function broadcastMessage(message: WSMessage) {
    const messageStr = JSON.stringify(message)
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr)
        }
    }
}
