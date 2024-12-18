import viewerConnector from '../src/index'
import { createBot } from 'mineflayer'

const bot = createBot({
    // host: 'kaboom.pw',

    port: 25569,
    username: 'dklj',
})

bot.loadPlugin(viewerConnector())

bot._client.on('connect', () => {
    console.log('connected')
})

bot.on('end', (err) => {
    console.error(err)
})
bot.on('error', (err) => {
    console.error(err)
})
bot.on('kicked', (err) => {
    console.error(err)
})
bot.on('spawn', () => {
    console.log('spawned')
})
bot.on('login', () => {
    console.log('logined')
})

bot.on('resourcePack', (url) => {
    bot.acceptResourcePack()
})

setInterval(() => {
    if (!bot.controlState) return
    if (bot.controlState.forward) {
        bot.controlState.forward = false
        bot.controlState.back = true
    } else {
        bot.controlState.forward = true
        bot.controlState.back = false
    }
}, 5000)

console.log('bot started')
