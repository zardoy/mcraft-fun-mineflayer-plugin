import { States } from 'minecraft-protocol'

export interface PacketData {
    connectionIndex: number
    isFromServer: boolean
    name: string
    data: any
    buffer?: Buffer
    timestamp: number
    type: 'packet'
    state: States
}

export interface ClientDisconnectData {
    connectionIndex: number
    type: 'clientDisconnect'
    timestamp: number
}

export type WSMessage = PacketData | ClientDisconnectData

export interface Connection {
    index: number
    isLeading: boolean
    packets: PacketData[]
    hidden: number
    matched: number
}

export interface PacketFilter {
    filter: string
    highlight: string
}
