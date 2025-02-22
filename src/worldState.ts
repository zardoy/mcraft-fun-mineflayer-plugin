import { ServerClient, states } from 'minecraft-protocol'
import { PacketsLogger } from "./packetsLogger"
import { EventEmitter } from 'events'
import fs from 'fs'
import { Bot } from 'mineflayer'

export const WORLD_STATE_VERSION = 1
export const WORLD_STATE_FILE_EXTENSION = 'worldstate.txt'

export const PACKETS_REPLAY_FILE_EXTENSION = 'packets.txt'

export interface WorldStateHeader {
    formatVersion: number
    minecraftVersion: string
}

export const createStateCaptureFile = (handleConnect: (client: ServerClient) => void, bot: Bot, fileName?: string, adjustPacketsLogger?: (logger: PacketsLogger) => void) => {
    const logger = new PacketsLogger()
    adjustPacketsLogger?.(logger)
    const header: WorldStateHeader = {
        formatVersion: WORLD_STATE_VERSION,
        minecraftVersion: bot.version,
    }
    logger.contents = `${JSON.stringify(header)}\n`
    //@ts-ignore
    class FakeClient extends EventEmitter implements ServerClient {
        id = 0
        state = states.PLAY
        username = ''
        socket = {} as any
        writeChannel(channel, params) {
            logger.log(true, { name: 'writeChannel', state: 'play' }, { channel, params })
        }
        write(name, params) {
            logger.log(true, { name, state: 'play' }, params)
        }
        registerChannel(name: string, typeDefinition: any, custom?: boolean): void {
        }
        chat() { }
        writeRaw(buffer: any): void {
            throw new Error('Not implemented')
        }
        supportFeature = bot.supportFeature
    }
    handleConnect(new FakeClient() as unknown as ServerClient)
    if (fileName) {
        fs.writeFileSync(`${fileName}.${WORLD_STATE_FILE_EXTENSION}`, logger.contents)
    }
    return logger
}
