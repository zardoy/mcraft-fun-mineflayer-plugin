import { ServerClient, States } from 'minecraft-protocol'
import { PacketsLogger } from "./packetsReplay"
import { EventEmitter } from 'events'
import fs from 'fs'
import { Bot } from 'mineflayer'

export const WORLD_STATE_VERSION = 1
export const WORLD_STATE_FILE_EXTENSION = '.worldstate'

export const PACKETS_REPLAY_FILE_EXTENSION = '.packets.txt'

export interface WorldStateHeader {
    formatVersion: number
    minecraftVersion: string
}

export const createStateCaptureFile = (handleConnect: (client: ServerClient) => void, bot: Bot, fileName?: string) => {
    const logger = new PacketsLogger()
    //@ts-ignore
    class FakeClient extends EventEmitter implements ServerClient {
        id = 0
        state = States.PLAY
        username = ''
        writeChannel(channel, params) {
            logger.log(true, { name: 'writeChannel', state: 'play' }, { channel, params })
        }
        write(name, params) {
            logger.log(true, { name, state: 'play' }, params)
        }
        supportFeature = bot.supportFeature
    }
    handleConnect(new FakeClient() as unknown as ServerClient)
    const header: WorldStateHeader = {
        formatVersion: WORLD_STATE_VERSION,
        minecraftVersion: bot.version,
    };
    const contents = `${JSON.stringify(header)}\n${logger.contents}`
    if (fileName) {
        fs.writeFileSync(`${fileName}.${WORLD_STATE_FILE_EXTENSION}`, contents)
    }
    return logger
}
