import { Bot } from 'mineflayer'
import { createMineflayerPluginServer, MineflayerPluginSettings } from './server'

export const viewerConnector = (options: MineflayerPluginSettings = {}) => {
    return (bot: Bot) => createMineflayerPluginServer(bot, options)
}

export const onReady = (bot: Bot) => {
    if (bot.webViewer) return Promise.resolve()
    return new Promise<void>((resolve) => {
        bot.once('inject_allowed', () => {
            resolve()
        })
    })
}
