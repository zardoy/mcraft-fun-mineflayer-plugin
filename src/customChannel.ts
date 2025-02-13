import type { Bot } from 'mineflayer'
import type { MineflayerPluginSettings } from './server'
import type { Client } from 'minecraft-protocol';

export const CHANNEL_NAME = 'minecraft-web-client:data'

export const registerCustomChannel = (bot: Bot, options: MineflayerPluginSettings, getClients: () => Client[]) => {

    const res = {
        send: (packet: CustomChannelPacketFromServer, client?: Client) => {
            const packetString = JSON.stringify(packet);
            if (client) {
                client.writeChannel(CHANNEL_NAME, packetString)
            } else {
                for (const client of getClients()) {
                    client.writeChannel(CHANNEL_NAME, packetString)
                }
            }
        },
        receivedProcessor: (packet: CustomChannelPacketFromClient) => { },
        registerChannel: (client: Client) => {
            if (!client['channelRegistered']) {
                client.registerChannel(CHANNEL_NAME, ['string', []], true)
                client['channelRegistered'] = true
            }
        },
        newConnection: (client: Client) => {
            client.on(CHANNEL_NAME, (packet) => {
                try {
                    res.receivedProcessor(JSON.parse(packet))
                } catch { }
            })
        }
    };
    return res
}

export type CustomChannelPacketFromClient = {
    type: 'eval'
    code: string
} | {
    type: 'method'
    method: string
    args: any[]
} | {
    type: 'ui'
    id: string
    param: string
    value: number | string | boolean
}

export type UiLilDef = {
    type: 'lil'
    title?: string
    /** @default true */
    opened?: boolean
    params: {
        [key: string]: number | string | boolean
    }
    buttons: string[]
}

export type UIDefinition = UiLilDef | {
    type: 'text'
    text: string
    x: number
    y: number
    /** @default false */
    onTab?: boolean
    /** @default true */
    motion?: boolean
    /** @default true */
    formatted?: boolean
    /** @default false */
    // markdown?: boolean
    /** @default "" */
    css?: string
} | {
    type: 'image'
    url: string
    x: number
    y: number
    width?: number
    height?: number
}

export type CustomChannelPacketFromServer = {
    type: 'eval'
    result: any
    isError: boolean
} | {
    type: 'method'
    result: any
} | {
    type: 'stats'
    botPing: number
    botUptime: number
} | {
    type: 'ui'
    update: {
        id: string
        data: UIDefinition | null // null if the ui is being removed
    }
} | {
    type: 'console'
    level: 'log' | 'warn' | 'error'
    message: string
}
