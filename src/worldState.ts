import { ServerClient, states } from 'minecraft-protocol'
import { PacketsFileHeader, PacketsLogger } from "./packetsLogger"
import { EventEmitter } from 'events'
import { Bot } from 'mineflayer'

export const WORLD_STATE_VERSION = 1
export const WORLD_STATE_FILE_EXTENSION = 'worldstate.txt'

export const PACKETS_REPLAY_FILE_EXTENSION = 'packets.txt'

// todo rename
export const createStateCaptureFile = (bot: Bot, adjustPacketsLogger?: (logger: PacketsLogger) => void) => {
    const header: PacketsFileHeader = {
        formatVersion: WORLD_STATE_VERSION,
        minecraftVersion: bot.version,
    }
    const logger = new PacketsLogger(header)
    adjustPacketsLogger?.(logger)
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
    return {
        client: new FakeClient() as unknown as ServerClient,
        logger
    }
}
